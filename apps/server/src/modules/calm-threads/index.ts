// Calm threads (docs/GROWTH_PRACTICES.md): thread-wide de-escalation in the Ted Lasso spirit.
// Facebook Groups' "conflict alerts" and slow mode, and Cornell's finding that early cues
// predict a conversation going awry (research/Kind_Interaction_UX_Research.md, sections 2-3).
// A heated thread shows everyone a calm note and goes to a moderator; a person, never
// the app, decides whether to slow it. Switch: practice_settings.calm_threads_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, notFound } from '../../errors.js';
import { assess } from '../kindness/index.js';
import { settings } from '../practices/index.js';

const HEAT = 3; // flagged comments
const WINDOW = '2 hours';
const QUIET_AFTER = '6 hours'; // a warm thread with no new heat calms down on its own
const SLOW_MINUTES = 10;

async function enabled(q: Queryable) {
  return (await settings(q)).calm_threads_enabled;
}

/**
 * Before a comment is added: in a thread a moderator slowed, one comment every 10 minutes
 * per person. This is the only limit, and only a person turns it on.
 */
export async function checkSlow(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) return;
  const { rows } = await q.query<{ wait: number }>(
    `select ceil(extract(epoch from (max(c.created_at) + make_interval(mins => $3) - now())) / 60)::int as wait
       from public.calm_threads t join public.comments c on c.post_id = t.post_id and c.user_id = $2
      where t.post_id = $1 and t.status = 'slow' and t.slow_until > now()
      having max(c.created_at) > now() - make_interval(mins => $3)`,
    [postId, userId, SLOW_MINUTES],
  );
  if (rows[0]) throw new AppError(429, 'SLOW_THREAD', `This conversation is taking it slow for a while. You can comment again in ${rows[0].wait} minutes.`);
}

/** After a comment: note heat (who and when, never the words) and open a calm thread if it's warming up. */
export async function noteComment(q: Queryable, userId: string, postId: string, body: string) {
  if (!(await enabled(q))) return false;
  if (assess(body).level === 'ok') return false;
  await q.query('insert into public.heated_comments (post_id, user_id) values ($1, $2)', [postId, userId]);
  const { rows } = await q.query<{ n: number; people: number }>(
    `select count(*)::int as n, count(distinct user_id)::int as people from public.heated_comments
      where post_id = $1 and created_at > now() - $2::interval`,
    [postId, WINDOW],
  );
  if (rows[0]!.n < HEAT || rows[0]!.people < 2) return false;
  // A settled or past thread warms up again only on fresh heat.
  await q.query(
    `insert into public.calm_threads (post_id) values ($1)
     on conflict (post_id) do update set status = 'warm', started_at = now(), decided_by = null, decided_at = null, slow_until = null
      where calm_threads.status <> 'warm' and not (calm_threads.status = 'slow' and calm_threads.slow_until > now())`,
    [postId],
  );
  return true;
}

/** What members see on the thread: nothing, a calm note, or the slow-mode note. */
export async function state(q: Queryable, postId: string) {
  if (!(await enabled(q))) return { enabled: false as const, calm: null };
  const { rows } = await q.query<{ status: string; slow_until: Date | null; recent: boolean }>(
    `select t.status, t.slow_until,
            exists (select 1 from public.heated_comments h where h.post_id = t.post_id and h.created_at > now() - $2::interval) as recent
       from public.calm_threads t where t.post_id = $1`,
    [postId, QUIET_AFTER],
  );
  const t = rows[0];
  if (!t) return { enabled: true as const, calm: null };
  if (t.status === 'slow' && t.slow_until && t.slow_until > new Date()) return { enabled: true as const, calm: { kind: 'slow' as const, until: t.slow_until.toISOString(), minutes: SLOW_MINUTES } };
  if (t.status === 'warm' && t.recent) return { enabled: true as const, calm: { kind: 'warm' as const } };
  return { enabled: true as const, calm: null };
}

/** Moderators: warm threads waiting for a person, newest first, with only counts. */
export async function queue(q: Queryable) {
  const { rows } = await q.query<{ post_id: string; started_at: Date; heated: number; people: number; preview: string }>(
    `select t.post_id, t.started_at,
            (select count(*)::int from public.heated_comments h where h.post_id = t.post_id and h.created_at >= t.started_at - $1::interval) as heated,
            (select count(distinct h.user_id)::int from public.heated_comments h where h.post_id = t.post_id and h.created_at >= t.started_at - $1::interval) as people,
            left(p.body, 120) as preview
       from public.calm_threads t join public.posts p on p.id = t.post_id
      where t.status = 'warm' order by t.started_at desc limit 50`,
    [WINDOW],
  );
  return rows.map((r) => ({ postId: r.post_id, startedAt: r.started_at.toISOString(), heated: r.heated, people: r.people, preview: r.preview }));
}

export const CalmDecision = z.object({ action: z.enum(['settle', 'slow']), hours: z.number().int().min(1).max(48).default(6) });

/** A moderator decides: it's fine (settle), or slow it for some hours. */
export async function decide(q: Queryable, moderatorId: string, postId: string, d: z.infer<typeof CalmDecision>) {
  if (!(await enabled(q))) throw badRequest('Calm threads are switched off');
  const { rowCount } = await q.query(
    `update public.calm_threads set status = $2, slow_until = case when $2 = 'slow' then now() + make_interval(hours => $3) end,
            decided_by = $4, decided_at = now()
      where post_id = $1`,
    [postId, d.action === 'slow' ? 'slow' : 'settled', d.hours, moderatorId],
  );
  if (!rowCount) throw notFound('Calm thread');
  return state(q, postId);
}
