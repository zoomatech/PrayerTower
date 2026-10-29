// Circle goals (research/Contributing_Without_Ad_Money.md, suggestion 9): the person who
// asked, or staff, sets a shared goal on a request, such as "50 people pray for this by
// Sunday". Progress counts different people who really prayed in the window, so the
// goal celebrates people showing up, not posts or clicks. Off by default.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import * as posts from '../posts/index.js';

export const NewGoal = z.object({ target: z.number().int().min(2).max(10000), days: z.number().int().min(1).max(30) });

async function enabled(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select circle_goals_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

async function canSet(q: Queryable, userId: string, post: posts.PostRow) {
  return post.user_id === userId || (await hasRole(q, userId, 'admin', 'moderator'));
}

export async function get(q: Queryable, userId: string, postId: string) {
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (!(await enabled(q)) || post.post_type !== 'prayer_request') return { enabled: false as const };
  const { rows } = await q.query<{ target: number; starts_at: Date; ends_at: Date; prayed: number }>(
    `select g.target, g.starts_at, g.ends_at,
            (select count(distinct e.user_id)::int from public.prayer_events e
              where e.post_id = g.post_id and e.user_id <> $2 and e.created_at between g.starts_at and g.ends_at) as prayed
       from public.circle_goals g where g.post_id = $1`,
    [postId, post.user_id],
  );
  const g = rows[0];
  return {
    enabled: true as const,
    canSet: post.state !== 'answered' && (await canSet(q, userId, post)),
    goal: g ? { target: g.target, endsAt: g.ends_at, prayed: g.prayed, met: g.prayed >= g.target, ended: g.ends_at < new Date() } : null,
  };
}

/** Sets or replaces the goal; a new goal starts counting now. */
export async function set(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewGoal>) {
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (!(await enabled(q)) || post.post_type !== 'prayer_request' || post.state === 'answered') throw forbidden('Circle goals are not available for this post');
  if (!(await canSet(q, userId, post))) throw forbidden('Only the person who asked can set a goal');
  await q.query(
    `insert into public.circle_goals (post_id, set_by, target, ends_at) values ($1, $2, $3, now() + make_interval(days => $4))
     on conflict (post_id) do update set set_by = $2, target = $3, starts_at = now(), ends_at = now() + make_interval(days => $4)`,
    [postId, userId, input.target, input.days],
  );
  return get(q, userId, postId);
}

export async function remove(q: Queryable, userId: string, postId: string) {
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (!(await canSet(q, userId, post))) throw forbidden('Only the person who asked can remove the goal');
  await q.query('delete from public.circle_goals where post_id = $1', [postId]);
  return get(q, userId, postId);
}
