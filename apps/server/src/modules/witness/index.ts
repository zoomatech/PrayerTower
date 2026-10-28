// Witness team: staff who read the feed for people in real need, keep private
// notes, and log help sent (notebook Page 3; Business Plan 6.4). Witness
// members, moderators and admins can use it. Nothing here is shown to the
// person being helped, and no money moves through the app.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';

export async function requireWitness(q: Queryable, userId: string) {
  if (!(await hasRole(q, userId, 'witness', 'moderator', 'admin'))) throw forbidden('Witness team only');
}

export const NewCase = z.object({ note: z.string().trim().min(1).max(2000) });
export const NewNote = z.object({ body: z.string().trim().min(1).max(2000), helpKind: z.string().trim().min(1).max(60).optional() });
export const STATUSES = ['watching', 'reaching_out', 'helped', 'closed'] as const;
export const CaseUpdate = z.object({ status: z.enum(STATUSES).optional(), assignToMe: z.boolean().optional() });

/** Mark a request as a sincere need to watch (once per request; a second flag just adds a note). */
export async function flag(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewCase>) {
  await requireWitness(q, userId);
  const { rows: post } = await q.query<{ community_id: string }>('select community_id from public.posts where id = $1', [postId]);
  if (!post[0]) throw notFound('Post');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.witness_cases (post_id, community_id, flagged_by) values ($1, $2, $3)
     on conflict (post_id) do update set updated_at = now() returning id`,
    [postId, post[0].community_id, userId],
  );
  const id = rows[0]!.id;
  await q.query('insert into public.witness_notes (case_id, user_id, body) values ($1, $2, $3)', [id, userId, input.note]);
  return { caseId: id };
}

export async function list(q: Queryable, userId: string, status?: (typeof STATUSES)[number]) {
  await requireWitness(q, userId);
  const { rows } = await q.query(
    `select w.id, w.post_id, w.status, w.updated_at, po.body as post_body, po.is_anonymous,
            coalesce(nullif(pr.display_name, ''), 'Member') as poster_name,
            a.display_name as assigned_name,
            (select count(*)::int from public.witness_notes n where n.case_id = w.id and n.help_kind is not null) as help_count,
            (select body from public.witness_notes n where n.case_id = w.id order by n.id desc limit 1) as last_note
       from public.witness_cases w
       join public.posts po on po.id = w.post_id
       join public.profiles pr on pr.id = po.user_id
       left join public.profiles a on a.id = w.assigned_to
      where ($1::public.witness_status is null and w.status <> 'closed') or w.status = $1
      order by w.updated_at desc limit 200`,
    [status ?? null],
  );
  // Staff see who posted even an anonymous request, so help can reach them; the app marks it.
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    status: r.status,
    postBody: r.post_body,
    posterName: r.poster_name,
    anonymousPost: r.is_anonymous,
    assignedTo: r.assigned_name,
    helpCount: r.help_count,
    lastNote: r.last_note,
    updatedAt: r.updated_at,
  }));
}

export async function notes(q: Queryable, userId: string, caseId: string) {
  await requireWitness(q, userId);
  const { rows } = await q.query(
    `select n.id, n.body, n.help_kind, n.created_at, coalesce(nullif(p.display_name, ''), 'Staff') as author
       from public.witness_notes n join public.profiles p on p.id = n.user_id where n.case_id = $1 order by n.id`,
    [caseId],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, helpKind: r.help_kind, author: r.author, createdAt: r.created_at }));
}

/** Add a note; with helpKind it records help sent and marks the case helped. */
export async function addNote(q: Queryable, userId: string, caseId: string, input: z.infer<typeof NewNote>) {
  await requireWitness(q, userId);
  const { rowCount } = await q.query(
    `update public.witness_cases set updated_at = now(),
            status = case when $2 then 'helped'::public.witness_status else status end
      where id = $1`,
    [caseId, !!input.helpKind],
  );
  if (!rowCount) throw notFound('Case');
  await q.query('insert into public.witness_notes (case_id, user_id, body, help_kind) values ($1, $2, $3, $4)', [
    caseId,
    userId,
    input.body,
    input.helpKind ?? null,
  ]);
}

export async function update(q: Queryable, userId: string, caseId: string, input: z.infer<typeof CaseUpdate>) {
  await requireWitness(q, userId);
  const { rowCount } = await q.query(
    `update public.witness_cases set status = coalesce($2, status),
            assigned_to = case when $3 then $4::uuid else assigned_to end, updated_at = now()
      where id = $1`,
    [caseId, input.status ?? null, !!input.assignToMe, userId],
  );
  if (!rowCount) throw notFound('Case');
}
