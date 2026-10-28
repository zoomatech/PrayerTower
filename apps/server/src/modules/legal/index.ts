// Law-enforcement escalation and evidence holds (migration 20261029004800_legal_cases.sql;
// docs/LEGAL_CASES.md). Off until an admin turns legal_settings.enabled on.
// A case records an agency's request or a moderator's referral. A hold copies
// what a member has posted and sent, and their moderation history, at the
// moment it is placed; the copy survives the member deleting things, and is
// erased when the hold is released or expires, or its case is closed.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export interface LegalSettings {
  enabled: boolean;
  defaultHoldDays: number;
}

export async function settings(q: Queryable): Promise<LegalSettings> {
  const { rows } = await q.query<LegalSettings>('select enabled, default_hold_days as "defaultHoldDays" from public.legal_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({ enabled: z.boolean().optional(), defaultHoldDays: z.number().int().min(1).max(3650).optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.legal_settings set enabled = coalesce($1, enabled), default_hold_days = coalesce($2, default_hold_days)', [
    p.enabled ?? null,
    p.defaultHoldDays ?? null,
  ]);
  return settings(q);
}

async function requireOn(q: Queryable) {
  if (!(await settings(q)).enabled) throw forbidden('Legal cases are switched off (Admin → Legal requests)');
}

// Cases ----------------------------------------------------------------------------

export const NewCase = z.object({
  kind: z.enum(['preservation', 'legal_process', 'emergency', 'referral']),
  agency: z.string().trim().max(200).nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  receivedAt: z.iso.datetime().nullable().optional(),
  /** The member the request is about: a profile id or @handle. */
  subject: z.string().trim().min(1).max(60).nullable().optional(),
  summary: z.string().trim().min(1).max(4000),
});

async function resolveMember(q: Queryable, who: string): Promise<string> {
  const handle = who.replace(/^@/, '').toLowerCase();
  const isId = z.uuid().safeParse(who).success;
  const { rows } = await q.query<{ id: string }>(
    isId ? 'select id from public.profiles where id = $1' : 'select id from public.profiles where lower(handle) = $1',
    [isId ? who : handle],
  );
  if (!rows[0]) throw notFound('Member');
  return rows[0].id;
}

const CASE = `c.id, c.kind, c.status, c.agency, c.reference, c.received_at as "receivedAt", c.subject_user_id as "subjectId",
  case when c.subject_user_id is not null
       then coalesce((select p.display_name from public.profiles p where p.id = c.subject_user_id), 'Deleted account') end as "subjectName",
  c.moderation_item_id as "moderationItemId", c.summary, c.created_at as "createdAt", c.closed_at as "closedAt",
  (select count(*)::int from public.evidence_holds h where h.case_id = c.id and h.released_at is null) as "activeHolds"`;

export async function list(q: Queryable) {
  const { rows } = await q.query(`select ${CASE} from public.legal_cases c order by c.status, c.created_at desc limit 200`);
  return rows;
}

export async function get(q: Queryable, id: string) {
  const { rows } = await q.query(`select ${CASE} from public.legal_cases c where c.id = $1`, [id]);
  if (!rows[0]) throw notFound('Case');
  const { rows: notes } = await q.query(
    `select n.id, n.body, n.created_at as "createdAt", p.display_name as author from public.legal_case_notes n
       left join public.profiles p on p.id = n.author_id where n.case_id = $1 order by n.created_at`,
    [id],
  );
  const { rows: holds } = await q.query(
    `select h.id, h.user_id as "userId", h.created_at as "createdAt", h.expires_at as "expiresAt", h.released_at as "releasedAt",
            (select count(*)::int from public.evidence_items e where e.hold_id = h.id) as items
       from public.evidence_holds h where h.case_id = $1 order by h.created_at`,
    [id],
  );
  return { case: rows[0], notes, holds };
}

export async function create(q: Queryable, adminId: string, input: z.infer<typeof NewCase>) {
  await requireOn(q);
  const subject = input.subject ? await resolveMember(q, input.subject) : null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.legal_cases (kind, agency, reference, received_at, subject_user_id, summary, opened_by)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [input.kind, input.agency || null, input.reference || null, input.receivedAt ?? null, subject, input.summary, adminId],
  );
  return get(q, rows[0]!.id);
}

export async function addNote(q: Queryable, authorId: string, caseId: string, body: string) {
  await get(q, caseId);
  await q.query('insert into public.legal_case_notes (case_id, author_id, body) values ($1, $2, $3)', [caseId, authorId, body]);
  return get(q, caseId);
}

/** Close a case and release (erase) its holds. */
export async function close(q: Queryable, caseId: string) {
  const { rowCount } = await q.query(`update public.legal_cases set status = 'closed', closed_at = now() where id = $1 and status = 'open'`, [caseId]);
  if (!rowCount) throw conflict('This case is already closed, or does not exist');
  const { rows } = await q.query<{ id: string }>('select id from public.evidence_holds where case_id = $1 and released_at is null', [caseId]);
  for (const h of rows) await release(q, h.id);
  return get(q, caseId);
}

/**
 * A moderator escalates a queue item to the admins as a possible referral to
 * law enforcement. Admins decide whether to contact anyone; the app never does.
 */
export async function escalate(q: Queryable, moderatorId: string, itemId: string, note: string) {
  await requireOn(q);
  const { rows } = await q.query<{ user_id: string; target_type: string }>('select user_id, target_type from public.moderation_items where id = $1', [itemId]);
  if (!rows[0]) throw notFound('Moderation item');
  const { rows: existing } = await q.query<{ id: string }>(`select id from public.legal_cases where moderation_item_id = $1 and status = 'open'`, [itemId]);
  if (existing[0]) return get(q, existing[0].id);
  const { rows: made } = await q.query<{ id: string }>(
    `insert into public.legal_cases (kind, subject_user_id, moderation_item_id, summary, opened_by) values ('referral', $1, $2, $3, $4) returning id`,
    [rows[0].user_id, itemId, note, moderatorId],
  );
  const { rows: admins } = await q.query<{ user_id: string }>(`select distinct user_id from public.user_roles where role = 'admin'`);
  for (const a of admins) {
    await notifications.notify(q, a.user_id, {
      kind: 'legal_referral',
      title: 'A moderator asked for a law-enforcement review',
      body: `A reported ${rows[0].target_type.replace('_', ' ')} was escalated. Open Admin → Legal requests to review it and decide whether to place a hold.`,
      data: { caseId: made[0]!.id },
      dedupeKey: `legal_referral:${made[0]!.id}`,
    });
  }
  return get(q, made[0]!.id);
}

// Holds ------------------------------------------------------------------------------

export const NewHold = z.object({ member: z.string().trim().min(1).max(60).optional(), days: z.number().int().min(1).max(3650).optional() });

/** Copy a member's records into the hold, as they are now. */
async function snapshot(q: Queryable, holdId: string, userId: string) {
  const copy = (kind: string, sql: string) =>
    q.query(
      `insert into public.evidence_items (hold_id, kind, source_id, created_at, data)
       select $1, '${kind}', x.id, x.created_at, to_jsonb(x) from (${sql}) x on conflict do nothing`,
      [holdId, userId],
    );
  await copy('profile', 'select * from public.profiles where id = $2');
  await copy('post', 'select * from public.posts where user_id = $2');
  await copy('comment', 'select * from public.comments where user_id = $2');
  await copy('message', 'select * from public.messages where user_id = $2');
  await copy('moderation_item', 'select * from public.moderation_items where user_id = $2');
  await copy('moderation_action', 'select * from public.moderation_actions where user_id = $2');
}

export async function placeHold(q: Queryable, adminId: string, caseId: string, input: z.infer<typeof NewHold>) {
  await requireOn(q);
  const { case: c } = (await get(q, caseId)) as { case: { status: string; subjectId: string | null } };
  if (c.status !== 'open') throw conflict('This case is closed');
  const userId = input.member ? await resolveMember(q, input.member) : c.subjectId;
  if (!userId) throw badRequest('Name the member to hold');
  const days = input.days ?? (await settings(q)).defaultHoldDays;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.evidence_holds (case_id, user_id, placed_by, expires_at) values ($1, $2, $3, now() + make_interval(days => $4)) returning id`,
    [caseId, userId, adminId, days],
  );
  await snapshot(q, rows[0]!.id, userId);
  return get(q, caseId);
}

/** Add anything the member posted or sent since the hold was placed. */
export async function refreshHold(q: Queryable, holdId: string) {
  const { rows } = await q.query<{ user_id: string; case_id: string }>('select user_id, case_id from public.evidence_holds where id = $1 and released_at is null', [holdId]);
  if (!rows[0]) throw notFound('Active hold');
  await snapshot(q, holdId, rows[0].user_id);
  return get(q, rows[0].case_id);
}

export async function extendHold(q: Queryable, holdId: string, days: number) {
  const { rows } = await q.query<{ case_id: string }>(
    `update public.evidence_holds set expires_at = greatest(expires_at, now()) + make_interval(days => $2) where id = $1 and released_at is null returning case_id`,
    [holdId, days],
  );
  if (!rows[0]) throw notFound('Active hold');
  return get(q, rows[0].case_id);
}

/** Erase the copy; the hold row stays as a record that it existed. */
export async function release(q: Queryable, holdId: string) {
  const { rows } = await q.query<{ case_id: string }>('update public.evidence_holds set released_at = now() where id = $1 and released_at is null returning case_id', [holdId]);
  if (!rows[0]) throw notFound('Active hold');
  await q.query('delete from public.evidence_items where hold_id = $1', [holdId]);
  return rows[0].case_id;
}

/** Everything a hold copied, for staff to review (and, if they decide to, disclose outside the app). */
export async function exportHold(q: Queryable, holdId: string) {
  const { rows: h } = await q.query(
    `select h.id, h.case_id as "caseId", h.user_id as "userId", h.created_at as "placedAt", h.expires_at as "expiresAt", h.released_at as "releasedAt",
            c.agency, c.reference, c.kind
       from public.evidence_holds h join public.legal_cases c on c.id = h.case_id where h.id = $1`,
    [holdId],
  );
  if (!h[0]) throw notFound('Hold');
  const { rows: items } = await q.query('select kind, source_id as "sourceId", created_at as "createdAt", data from public.evidence_items where hold_id = $1 order by kind, created_at', [holdId]);
  return { exportedAt: new Date().toISOString(), hold: h[0], items };
}

/** Daily: release holds past their end date, erasing the copies. */
export async function releaseExpired(q: Queryable): Promise<number> {
  const { rows } = await q.query<{ id: string }>('select id from public.evidence_holds where released_at is null and expires_at <= now()');
  for (const r of rows) await release(q, r.id);
  return rows.length;
}

export function expireTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const n = await releaseExpired(q);
    if (n) helpers.logger.info(`legal: released ${n} expired hold(s)`);
  };
}
