// Commitments module: "Commit to Regular Prayer" promises, check-ins, snooze,
// and the reminder scheduler (a cron task that finds due reminders).
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import { product } from '../../config.js';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export const FREQUENCIES = ['weekly', 'daily', 'three_daily'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const intervalMs: Record<Frequency, number> = {
  weekly: 7 * 86_400_000,
  daily: 86_400_000,
  three_daily: 8 * 3_600_000,
};

export const NewCommitment = z.object({
  frequency: z.enum(FREQUENCIES),
  durationDays: z.number().int().min(1).max(365).optional(),
  vowText: z.string().trim().min(1).max(500),
  isAnonymous: z.boolean().optional(),
});

export interface CommitmentRow {
  id: string;
  post_id: string;
  user_id: string;
  frequency: Frequency;
  vow_text: string;
  is_anonymous: boolean;
  starts_at: Date;
  ends_at: Date | null;
  status: 'active' | 'completed' | 'cancelled';
  next_reminder_at: Date | null;
  committed_count: number;
  completed_count: number;
}

export async function create(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewCommitment>) {
  const post = await posts.getActionable(q, userId, postId);
  if (!post) throw notFound('Post');
  const profile = await getProfile(q, userId);
  const isAnonymous = input.isAnonymous ?? profile?.anonymous_by_default ?? false;
  const now = Date.now();
  const endsAt = input.durationDays ? new Date(now + input.durationDays * 86_400_000) : null;
  let row: CommitmentRow;
  try {
    const { rows } = await q.query<CommitmentRow>(
      `insert into public.commitments (post_id, user_id, frequency, vow_text, is_anonymous, ends_at, next_reminder_at)
       values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [postId, userId, input.frequency, input.vowText, isAnonymous, endsAt, new Date(now + intervalMs[input.frequency])],
    );
    row = rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw badRequest('You already have an active commitment for this request');
    throw err;
  }
  await posts.markActivelyPrayed(q, postId);
  if (post.user_id !== userId) {
    const who = isAnonymous ? 'Someone' : profile?.display_name || 'Someone';
    await notifications.notify(q, post.user_id, {
      kind: 'commitment_made',
      title: `${who} committed to pray for you`,
      body: `${who} will pray ${label(input.frequency)}.`,
      t: { key: 'commitment_made', params: { who: who === 'Someone' ? null : who, frequency: input.frequency } },
      data: { postId },
    });
  }
  return row;
}

const label = (f: Frequency) => ({ weekly: 'every week', daily: 'every day', three_daily: 'three times a day' })[f];

async function mine(q: Queryable, userId: string, commitmentId: string) {
  const { rows } = await q.query<CommitmentRow>('select * from public.commitments where id = $1 and user_id = $2 for update', [
    commitmentId,
    userId,
  ]);
  if (!rows[0]) throw notFound('Commitment');
  return rows[0];
}

/** "I prayed": record the prayer and count it toward the commitment. */
export async function checkIn(q: Queryable, userId: string, commitmentId: string, durationSeconds?: number) {
  const c = await mine(q, userId, commitmentId);
  if (c.status !== 'active') throw badRequest('This commitment is not active');
  const { rows } = await q.query<{ id: string; day: string }>(
    `insert into public.prayer_events (post_id, user_id, kind, commitment_id, duration_seconds, is_anonymous)
     values ($1, $2, 'commitment_checkin', $3, $4, $5)
     returning id, to_char(created_at at time zone 'utc', 'YYYY-MM-DD') as day`,
    [c.post_id, userId, c.id, durationSeconds ?? null, c.is_anonymous],
  );
  const { rows: updated } = await q.query<CommitmentRow>(
    'update public.commitments set completed_count = completed_count + 1 where id = $1 returning *',
    [c.id],
  );
  // Tokens are for praying for others, as with Praying Now: no token for your own request.
  const { rows: own } = await q.query<{ own: boolean }>('select user_id = $2 as own from public.posts where id = $1', [c.post_id, userId]);
  if (!own[0]?.own) await tokens.earn(q, userId, product.prayingNowTokens, `earn:checkin:${c.id}:${rows[0]!.day}`, 'Commitment check-in');
  await tokens.creditPriestlyProgress(q, rows[0]!.id);
  return updated[0]!;
}

export async function snooze(q: Queryable, userId: string, commitmentId: string, minutes: number) {
  const c = await mine(q, userId, commitmentId);
  if (c.status !== 'active') throw badRequest('This commitment is not active');
  const { rows } = await q.query<CommitmentRow>(
    `update public.commitments set next_reminder_at = now() + make_interval(mins => $2) where id = $1 returning *`,
    [c.id, minutes],
  );
  return rows[0]!;
}

export const Edit = z
  .object({
    frequency: z.enum(FREQUENCIES),
    vowText: z.string().trim().min(1).max(500),
    status: z.enum(['active', 'completed', 'cancelled']),
    completedCount: z.number().int().min(0),
  })
  .partial();

/** Members can correct their own record ("data helps us measure whether we're helping"). */
export async function edit(q: Queryable, userId: string, commitmentId: string, input: z.infer<typeof Edit>) {
  const c = await mine(q, userId, commitmentId);
  const fallbackNext = new Date(Date.now() + intervalMs[input.frequency ?? c.frequency]);
  const { rows } = await q.query<CommitmentRow>(
    `update public.commitments set
        frequency = coalesce($2::public.commitment_frequency, frequency),
        vow_text = coalesce($3, vow_text),
        status = coalesce($4::public.commitment_status, status),
        completed_count = coalesce($5::int, completed_count),
        next_reminder_at = case when coalesce($4::public.commitment_status, status) = 'active' then coalesce(next_reminder_at, $6::timestamptz) end
      where id = $1 returning *`,
    [c.id, input.frequency ?? null, input.vowText ?? null, input.status ?? null, input.completedCount ?? null, fallbackNext],
  ).catch((err) => {
    if (err.code === '23505') throw badRequest('You already have an active commitment for this request');
    throw err;
  });
  return rows[0]!;
}

export async function list(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select c.*, left(p.body, 140) as post_excerpt from public.commitments c join public.posts p on p.id = c.post_id
      where c.user_id = $1 order by (c.status = 'active') desc, c.id desc`,
    [userId],
  );
  return rows;
}

/**
 * Cron task (every minute): send each due reminder, count it as a committed
 * prayer, and schedule the next one. SKIP LOCKED lets several workers share the load.
 */
export function sendDueRemindersTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      await client.query('begin');
      try {
        const { rows } = await client.query<CommitmentRow & { excerpt: string }>(
          `select c.*, left(p.body, 80) as excerpt from public.commitments c join public.posts p on p.id = c.post_id
            where c.status = 'active' and c.next_reminder_at <= now()
            order by c.next_reminder_at limit 500
            for update of c skip locked`,
        );
        for (const c of rows) {
          if (c.ends_at && c.ends_at <= new Date()) {
            await client.query(`update public.commitments set status = 'completed', next_reminder_at = null where id = $1`, [c.id]);
            continue;
          }
          await notifications.notify(client, c.user_id, {
            kind: 'commitment_reminder',
            title: 'Time to pray',
            body: `You promised to pray: "${c.excerpt}"`,
            t: { key: 'commitment_reminder', params: { excerpt: c.excerpt } },
            data: { postId: c.post_id, commitmentId: c.id },
          });
          // Skip forward past any missed slots rather than sending a burst.
          let next = c.next_reminder_at!.getTime() + intervalMs[c.frequency];
          while (next <= Date.now()) next += intervalMs[c.frequency];
          await client.query(
            'update public.commitments set committed_count = committed_count + 1, next_reminder_at = $2 where id = $1',
            [c.id, new Date(next)],
          );
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    });
  };
}

export async function metrics(q: Queryable, since: Date) {
  const { rows } = await q.query(
    `select count(*) filter (where created_at >= $1)::int as made,
            count(*) filter (where status = 'active')::int as active,
            coalesce(sum(committed_count), 0)::int as prayers_committed,
            coalesce(sum(completed_count), 0)::int as prayers_completed
       from public.commitments`,
    [since],
  );
  return rows[0];
}

/** The member's active commitment they have gone longest without checking in on (at least `olderThanHours`). */
export async function leastRecentlyPrayed(q: Queryable, userId: string, olderThanHours: number, excludePostIds: string[]) {
  const { rows } = await q.query<{ id: string; post_id: string; last_prayed_at: Date | null }>(
    `select c.id, c.post_id,
            (select max(e.created_at) from public.prayer_events e where e.commitment_id = c.id) as last_prayed_at
       from public.commitments c
      where c.user_id = $1 and c.status = 'active' and not (c.post_id = any($3::uuid[]))
        and coalesce((select max(e.created_at) from public.prayer_events e where e.commitment_id = c.id), c.created_at)
            < now() - make_interval(hours => $2)
      order by last_prayed_at nulls first, c.created_at
      limit 1`,
    [userId, olderThanHours, excludePostIds],
  );
  return rows[0] ?? null;
}

/** A positively framed summary of the last seven days. */
export async function weeklyReview(q: Queryable, userId: string) {
  const { rows } = await q.query<{ prayers: number; checkins: number; people: number; active: number; kept: number }>(
    `select (select count(*)::int from public.prayer_events where user_id = $1 and created_at > now() - interval '7 days') as prayers,
            (select count(*)::int from public.prayer_events where user_id = $1 and kind = 'commitment_checkin'
               and created_at > now() - interval '7 days') as checkins,
            (select count(distinct post_id)::int from public.prayer_events where user_id = $1
               and created_at > now() - interval '7 days') as people,
            (select count(*)::int from public.commitments where user_id = $1 and status = 'active') as active,
            (select count(distinct commitment_id)::int from public.prayer_events where user_id = $1
               and kind = 'commitment_checkin' and created_at > now() - interval '7 days') as kept`,
    [userId],
  );
  const r = rows[0]!;
  const message =
    r.prayers > 0
      ? `This week you prayed ${r.prayers} ${r.prayers === 1 ? 'time' : 'times'} for ${r.people} ${r.people === 1 ? 'request' : 'requests'}. Thank you for standing with them.`
      : r.active > 0
        ? 'Your commitments are here whenever you are ready. WE DO NOT JUDGE.'
        : 'When you are ready, there are people waiting for prayer.';
  return { ...r, message };
}

/** Weekly cron: send each member with commitments their review. */
export function weeklyReviewTask(q: Queryable): Task {
  return async () => {
    const { rows } = await q.query<{ user_id: string }>(
      `select distinct user_id from public.commitments where status = 'active' or updated_at > now() - interval '7 days'`,
    );
    const week = new Date().toISOString().slice(0, 10);
    for (const { user_id } of rows) {
      const review = await weeklyReview(q, user_id);
      await notifications.notify(q, user_id, {
        kind: 'weekly_review',
        title: 'Your week in prayer',
        body: review.message,
        t: { key: 'weekly_review', params: { body: review.message } },
        data: { prayers: review.prayers, people: review.people },
        dedupeKey: `weekly_review:${week}`,
      });
    }
  };
}
