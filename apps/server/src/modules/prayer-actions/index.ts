// Prayer actions module: Praying Now. The tap writes a PrayerEvent and queues
// the follow-up work in the same transaction, so the tap returns immediately
// and nothing is lost if the worker is down.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import { product } from '../../config.js';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export const PrayingNow = z.object({
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  isAnonymous: z.boolean().optional(),
});

export async function prayingNow(q: Queryable, userId: string, postId: string, input: z.infer<typeof PrayingNow>) {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  const profile = await getProfile(q, userId);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.prayer_events (post_id, user_id, kind, duration_seconds, is_anonymous)
     values ($1, $2, 'praying_now', $3, $4) returning id`,
    [postId, userId, input.durationSeconds ?? null, input.isAnonymous ?? profile?.anonymous_by_default ?? false],
  );
  await posts.markActivelyPrayed(q, postId);
  await enqueue(q, 'prayer_actions_after_praying_now', { eventId: rows[0]!.id });
  return { eventId: rows[0]!.id };
}

/** Credit the earned token (once per post per UTC day) and tell the requester. */
export function afterPrayingNowTask(q: Queryable): Task {
  return async (payload) => {
    const { eventId } = payload as { eventId: string };
    const { rows } = await q.query<{
      user_id: string;
      post_id: string;
      is_anonymous: boolean;
      day: string;
      poster_id: string;
      display_name: string;
    }>(
      `select e.user_id, e.post_id, e.is_anonymous, to_char(e.created_at at time zone 'utc', 'YYYY-MM-DD') as day,
              po.user_id as poster_id, pr.display_name
         from public.prayer_events e
         join public.posts po on po.id = e.post_id
         join public.profiles pr on pr.id = e.user_id
        where e.id = $1`,
      [eventId],
    );
    const e = rows[0];
    if (!e) return;
    await tokens.creditPriestlyProgress(q, eventId);
    if (e.user_id === e.poster_id) return;
    await tokens.earn(q, e.user_id, product.prayingNowTokens, `earn:praying_now:${e.user_id}:${e.post_id}:${e.day}`, 'Praying Now');
    const who = e.is_anonymous ? 'Someone' : e.display_name || 'Someone';
    const poster = await getProfile(q, e.poster_id);
    await notifications.notify(q, e.poster_id, {
      kind: 'praying_now',
      title: `${who} is praying for you${poster?.display_name ? `, ${poster.display_name},` : ''} right now`,
      body: 'Someone stopped to bring your request before the Lord.',
      t: { key: 'praying_now', params: { who: e.is_anonymous ? null : e.display_name, poster: poster?.display_name } },
      data: { postId: e.post_id },
      dedupeKey: `praying_now:${e.post_id}:${e.user_id}:${e.day}`,
    });
  };
}

/** Lifetime prayer events (Praying Now taps + commitment check-ins) per member. */
export async function prayerCounts(q: Queryable, userIds: string[]): Promise<Map<string, number>> {
  const { rows } = await q.query<{ user_id: string; n: number }>(
    'select user_id, count(*)::int as n from public.prayer_events where user_id = any($1::uuid[]) group by user_id',
    [userIds],
  );
  return new Map(userIds.map((id) => [id, rows.find((r) => r.user_id === id)?.n ?? 0]));
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*) filter (where kind = 'praying_now')::int as praying_now_taps,
            count(*) filter (where kind = 'commitment_checkin')::int as checkins,
            count(distinct user_id)::int as active_pray_ers,
            coalesce(sum(duration_seconds), 0)::int as seconds_in_prayer
       from public.prayer_events where created_at >= $1`,
    [since],
  );
  return rows[0];
}
