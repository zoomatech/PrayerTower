// Care module: a member asks a prayer partner or pastor to pray with them
// (notebook Page 4). Staff with the matching role see open requests, one
// claims it, and the two talk in a private care conversation. Confession to
// clergy (Page 2) is behind a switch that stays off until a lawyer reviews it.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../errors.js';
import type { Role } from '../accounts/index.js';
import { hasRole } from '../accounts/index.js';
import * as messages from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import * as safety from '../safety/index.js';

export const CARE_KINDS = ['pray_with_me', 'pastor', 'confession'] as const;
export type CareKind = (typeof CARE_KINDS)[number];

/** Which staff roles answer each kind of request. */
export const CARE_ROLES: Record<CareKind, Role[]> = {
  pray_with_me: ['prayer_partner', 'pastor_counselor'],
  pastor: ['pastor_counselor'],
  confession: ['pastor_counselor'],
};

export interface CareSettings {
  care_enabled: boolean;
  confession_enabled: boolean;
  max_open_per_member: number;
}

export async function settings(q: Queryable): Promise<CareSettings> {
  const { rows } = await q.query<CareSettings>('select care_enabled, confession_enabled, max_open_per_member from public.care_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({
  careEnabled: z.boolean().optional(),
  confessionEnabled: z.boolean().optional(),
  maxOpenPerMember: z.number().int().min(1).max(50).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<CareSettings> {
  const { rows } = await q.query<CareSettings>(
    `update public.care_settings set care_enabled = coalesce($1, care_enabled), confession_enabled = coalesce($2, confession_enabled),
       max_open_per_member = coalesce($3, max_open_per_member)
     returning care_enabled, confession_enabled, max_open_per_member`,
    [p.careEnabled ?? null, p.confessionEnabled ?? null, p.maxOpenPerMember ?? null],
  );
  return rows[0]!;
}

/** What the app offers: the kinds that are switched on. */
export async function options(q: Queryable) {
  const s = await settings(q);
  if (!s.care_enabled) return { enabled: false, kinds: [] as CareKind[] };
  return { enabled: true, kinds: CARE_KINDS.filter((k) => k !== 'confession' || s.confession_enabled) };
}

export const NewCareRequest = z.object({ kind: z.enum(CARE_KINDS), body: z.string().trim().min(1).max(2000) });

export async function request(q: Queryable, userId: string, input: z.infer<typeof NewCareRequest>) {
  const s = await settings(q);
  if (!s.care_enabled) throw forbidden('Prayer partners are not available right now');
  if (input.kind === 'confession' && !s.confession_enabled) throw forbidden('Confession is not available yet');
  const { rows: open } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.care_requests where user_id = $1 and status in ('open', 'claimed')`,
    [userId],
  );
  if (open[0]!.n >= s.max_open_per_member) {
    throw new AppError(429, 'care_limit', 'You already have a request waiting. A prayer partner will be with you soon.');
  }
  const crisis = safety.mentionsCrisis(input.body);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.care_requests (user_id, kind, body, crisis) values ($1, $2, $3, $4) returning id`,
    [userId, input.kind, input.body, crisis],
  );
  const id = rows[0]!.id;
  // Tell the staff who can answer it (and moderators, when someone may be in danger).
  const roles: Role[] = crisis ? [...CARE_ROLES[input.kind], 'moderator'] : CARE_ROLES[input.kind];
  const { rows: staff } = await q.query<{ user_id: string }>(
    `select distinct user_id from public.user_roles where role = any($1::public.app_role[]) and user_id <> $2`,
    [roles, userId],
  );
  for (const r of staff) {
    await notifications.notify(q, r.user_id, {
      kind: 'care_request',
      title: crisis ? 'Someone may be in danger and asked for prayer' : 'Someone asked for a prayer partner',
      body: 'Open the care queue to reach out.',
      t: { key: 'care_request', params: { crisis } },
      data: { careRequestId: id },
      dedupeKey: `care_request:${id}`,
    });
  }
  return { id, crisis };
}

export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select id, kind, body, status, conversation_id, created_at from public.care_requests where user_id = $1 order by id desc limit 20`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body, status: r.status, conversationId: r.conversation_id, createdAt: r.created_at }));
}

async function myKinds(q: Queryable, userId: string): Promise<CareKind[]> {
  const out: CareKind[] = [];
  for (const k of CARE_KINDS) if (await hasRole(q, userId, ...CARE_ROLES[k])) out.push(k);
  return out;
}

/** Open requests this staff member can answer: anyone who may be in danger first, then oldest first. */
export async function queue(q: Queryable, staffId: string) {
  const kinds = await myKinds(q, staffId);
  if (!kinds.length) throw forbidden('Prayer partners and pastors only');
  const { rows } = await q.query(
    `select r.id, r.kind, r.body, r.crisis, r.created_at, coalesce(nullif(p.display_name, ''), 'Member') as name
       from public.care_requests r join public.profiles p on p.id = r.user_id
      where r.status = 'open' and r.kind = any($1::public.care_kind[]) and r.user_id <> $2
      order by r.crisis desc, r.id limit 100`,
    [kinds, staffId],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, body: r.body, crisis: r.crisis, createdAt: r.created_at, name: r.name }));
}

/** A staff member takes a request; the member and staff member get a private care conversation. */
export async function claim(q: Queryable, staffId: string, id: string) {
  const { rows } = await q.query<{ user_id: string; kind: CareKind; body: string; status: string }>(
    'select user_id, kind, body, status from public.care_requests where id = $1 for update',
    [id],
  );
  const r = rows[0];
  if (!r) throw notFound('Request');
  if (!(await hasRole(q, staffId, ...CARE_ROLES[r.kind]))) throw forbidden('Prayer partners and pastors only');
  if (r.user_id === staffId) throw badRequest('This is your own request');
  if (r.status !== 'open') throw conflict('Someone already reached out to them');
  if (await messages.isBlocked(q, staffId, r.user_id)) throw forbidden("You can't reach this member");

  const { rows: conv } = await q.query<{ id: string }>(
    `insert into public.conversations (kind, created_by, community_id)
     select 'care', $1, community_id from public.care_requests where id = $2 returning id`,
    [r.user_id, id],
  );
  const conversationId = conv[0]!.id;
  await q.query(
    `insert into public.conversation_members (conversation_id, user_id, is_owner) values ($1, $2, true), ($1, $3, false)`,
    [conversationId, r.user_id, staffId],
  );
  // The request opens the conversation, so both see what was asked.
  const { rows: msg } = await q.query<{ created_at: Date }>(
    `insert into public.messages (conversation_id, user_id, community_id, body)
     select $1, $2, community_id, $3 from public.conversations where id = $1 returning created_at`,
    [conversationId, r.user_id, r.body],
  );
  await q.query('update public.conversations set last_message_at = $2 where id = $1', [conversationId, msg[0]!.created_at]);
  await q.query(
    `update public.care_requests set status = 'claimed', claimed_by = $2, claimed_at = now(), conversation_id = $3 where id = $1`,
    [id, staffId, conversationId],
  );
  const { rows: who } = await q.query<{ name: string }>(`select coalesce(nullif(display_name, ''), 'A prayer partner') as name from public.profiles where id = $1`, [staffId]);
  await notifications.notify(q, r.user_id, {
    kind: 'message',
    title: `${who[0]!.name} is here to pray with you`,
    body: 'Open the conversation to talk and pray together.',
    t: { key: 'care_claimed', params: { who: who[0]!.name === 'A prayer partner' ? null : who[0]!.name } },
    data: { conversationId },
    dedupeKey: `care_claimed:${id}`,
  });
  return { conversationId };
}

/** The member or the staff member closes the request when they're done. */
export async function close(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query(
    `update public.care_requests set status = 'closed', closed_at = now()
      where id = $1 and status <> 'closed' and (user_id = $2 or claimed_by = $2)`,
    [id, userId],
  );
  if (!rowCount) throw notFound('Request');
}
