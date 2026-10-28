// Witness team: staff who read the feed for people in real need, keep private
// notes, and log help sent (notebook Page 3; Business Plan 6.4). Witness
// members, moderators and admins can use it. Nothing here is shown to the
// person being helped, and no money moves through the app.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';

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

// Witness stories ------------------------------------------------------------------------
// Business Plan 7: with permission, stories of help delivered go back to the
// community. The person helped approves the exact text first; it never names
// them; they can take the approval back. Switched off until an admin turns it on.

export const NewStory = z.object({ body: z.string().trim().min(20).max(1000) });

async function storiesEnabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select witness_stories_enabled as on from public.notebook_settings');
  return !!rows[0]?.on;
}

/** A Witness member drafts the story of a helped case and asks the person helped. */
export async function draftStory(q: Queryable, userId: string, caseId: string, input: z.infer<typeof NewStory>) {
  await requireWitness(q, userId);
  if (!(await storiesEnabled(q))) throw forbidden('Witness stories are turned off for now');
  const { rows } = await q.query<{ status: string; poster_id: string; post_id: string }>(
    `select w.status, p.user_id as poster_id, p.id as post_id from public.witness_cases w join public.posts p on p.id = w.post_id where w.id = $1`,
    [caseId],
  );
  const c = rows[0];
  if (!c) throw notFound('Case');
  if (c.status !== 'helped') throw badRequest('Log the help first: a story is only for a case marked helped');
  if (c.poster_id === userId) throw badRequest("You can't ask yourself");
  const { rows: created } = await q.query<{ id: string }>(
    `insert into public.witness_stories (case_id, author_id, recipient_id, body) values ($1, $2, $3, $4)
     on conflict do nothing returning id`,
    [caseId, userId, c.poster_id, input.body],
  );
  if (!created[0]) throw conflict('This case already has a story waiting or shown');
  await notifications.notify(q, c.poster_id, {
    kind: 'witness_story',
    title: 'May we share how you were helped?',
    body: 'The Witness team wrote a short story about the help you received. Nothing is shared unless you say yes, and it never shows your name.',
    t: { key: 'witness_story', params: {} },
    data: { storyId: created[0].id, postId: c.post_id },
    dedupeKey: `witness_story:${created[0].id}`,
  });
  return { id: created[0].id };
}

/** Stories about me: waiting for my answer, approved or declined. */
export async function myStories(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; body: string; status: string; created_at: Date; decided_at: Date | null }>(
    `select id, body, status, created_at, decided_at from public.witness_stories
      where recipient_id = $1 and status <> 'withdrawn' order by created_at desc`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, body: r.body, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at }));
}

/** The person helped says yes or no; a later "no" takes a shown story down. */
export async function decideStory(q: Queryable, userId: string, storyId: string, approve: boolean) {
  const { rowCount } = await q.query(
    `update public.witness_stories set status = $3::public.witness_story_status, decided_at = now()
      where id = $1 and recipient_id = $2 and status in ('awaiting_consent', 'approved')`,
    [storyId, userId, approve ? 'approved' : 'declined'],
  );
  if (!rowCount) throw notFound('Story');
}

/** Witness staff take back a story they drafted (or any, for moderators and admins). */
export async function withdrawStory(q: Queryable, userId: string, storyId: string) {
  await requireWitness(q, userId);
  const { rowCount } = await q.query(
    `update public.witness_stories set status = 'withdrawn', decided_at = now() where id = $1 and status in ('awaiting_consent', 'approved')`,
    [storyId],
  );
  if (!rowCount) throw notFound('Story');
}

/** Approved stories, newest first, with no names. Empty while the switch is off. */
export async function shownStories(q: Queryable, viewerId: string, limit = 20) {
  if (!(await storiesEnabled(q))) return { enabled: false, stories: [] };
  // Only stories from the viewer's own community (Open Circle never sees the Christian feed's).
  const { rows } = await q.query<{ id: string; body: string; decided_at: Date }>(
    `select s.id, s.body, s.decided_at from public.witness_stories s join public.witness_cases c on c.id = s.case_id
      where s.status = 'approved' and c.community_id = public.member_community_id($2)
      order by s.decided_at desc limit $1`,
    [limit, viewerId],
  );
  return { enabled: true, stories: rows.map((r) => ({ id: r.id, body: r.body, sharedAt: r.decided_at })) };
}
