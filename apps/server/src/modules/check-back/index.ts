// Gentle "check back" (docs/GROWTH_PRACTICES.md): the person who asked picks when to be
// reminded to share how it's going (3, 7 or 14 days), and gets one soft reminder then.
// When they post an update, everyone who prayed gets a quiet in-app heads-up, never a
// push, at most once a day per request. The heads-up names no words from the update.
// Switch: practice_settings.check_back_enabled, off.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import { settings } from '../practices/index.js';

export const CHECK_BACK_DAYS = [3, 7, 14] as const;
export const CheckBackPatch = z.object({ days: z.union([z.literal(3), z.literal(7), z.literal(14), z.null()]) });

async function enabled(q: Queryable) {
  return (await settings(q)).check_back_enabled;
}

/** The viewer's reminder on their own request: when it's due, or null. */
export async function mine(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) return { enabled: false as const, dueAt: null };
  const { rows } = await q.query<{ due_at: Date }>('select due_at from public.check_backs where post_id = $1 and user_id = $2 and sent_at is null', [postId, userId]);
  return { enabled: true as const, dueAt: rows[0]?.due_at.toISOString() ?? null };
}

/** Set (or with null, clear) the author's reminder on their open, visible request. */
export async function set(q: Queryable, userId: string, postId: string, days: 3 | 7 | 14 | null) {
  if (!(await enabled(q))) throw badRequest('Check back is switched off');
  const post = await posts.get(q, postId);
  if (!post || post.moderation_status !== 'visible') throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the poster can set a reminder');
  if (days === null) {
    await q.query('delete from public.check_backs where post_id = $1', [postId]);
    return mine(q, userId, postId);
  }
  if (post.post_type !== 'prayer_request' || post.state === 'answered') throw badRequest('Only an open request can have a reminder');
  await q.query(
    `insert into public.check_backs (post_id, user_id, due_at) values ($1, $2, now() + make_interval(days => $3))
     on conflict (post_id) do update set due_at = excluded.due_at, sent_at = null`,
    [postId, userId, days],
  );
  return mine(q, userId, postId);
}

/** Send each reminder that's due, once. A request answered since then gets none. */
export function dueTask(q: Queryable): Task {
  return async () => {
    if (!(await enabled(q))) return;
    const { rows } = await q.query<{ post_id: string; user_id: string; people: number }>(
      `update public.check_backs b set sent_at = now()
         from public.posts p
        where p.id = b.post_id and b.sent_at is null and b.due_at <= now()
          and p.state <> 'answered' and p.moderation_status = 'visible'
        returning b.post_id, b.user_id,
          (select count(distinct e.user_id)::int from public.prayer_events e where e.post_id = b.post_id and e.user_id <> b.user_id) as people`,
    );
    for (const r of rows) {
      await notifications.notify(q, r.user_id, {
        kind: 'check_back',
        title: 'Checking back, as you asked',
        body:
          r.people > 0
            ? `${r.people === 1 ? '1 person' : `${r.people} people`} prayed for your request. If you'd like, share a short update. No pressure at all.`
            : "If you'd like, share a short update on your request. No pressure at all.",
        data: { postId: r.post_id, checkBack: true },
        dedupeKey: `check_back:${r.post_id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  };
}

/**
 * After the author posts an update: a quiet heads-up to everyone who prayed (in-app,
 * no push, once a day per request), and a pending reminder is no longer needed.
 */
export async function noteUpdate(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) return;
  const post = await posts.get(q, postId);
  if (!post || post.user_id !== userId || post.moderation_status !== 'visible') return;
  await q.query('delete from public.check_backs where post_id = $1 and sent_at is null', [postId]);
  const who = post.is_anonymous ? null : (await getProfile(q, userId))?.display_name || null;
  const day = new Date().toISOString().slice(0, 10);
  for (const recipientId of await posts.prayedBy(q, postId, userId)) {
    await notifications.notify(q, recipientId, {
      kind: 'check_back_update',
      title: 'A quiet update',
      body: `${who ?? 'Someone'} shared an update on a request you prayed for.`,
      data: { postId },
      dedupeKey: `check_back_update:${postId}:${day}`,
      quiet: true,
    });
  }
}
