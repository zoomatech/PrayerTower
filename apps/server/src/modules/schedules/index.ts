// Schedules module (roadmap Phase 2): scheduled token spending. A member sets
// tokens to go to a request at a chosen time (Friday evening, a game's start),
// once or weekly for a number of weeks. Tokens are taken when it runs.
// Scheduled radio sends (off until an admin turns on scheduled_radio_enabled):
// instead of tokens for reach, the request goes out by radio, or amplified, at
// that time, at the radio prayer's own price and under its rules.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as radio from '../radio/index.js';
import { AppError } from '../../errors.js';
import * as tokens from '../tokens/index.js';

/** Placeholder limits. */
export const MAX_ACTIVE_PER_MEMBER = 20;
const MAX_DAYS_AHEAD = 365;
const WEEK_MS = 7 * 24 * 3600 * 1000;

export const NewSchedule = z.object({
  amount: z.number().int().min(1).max(10_000),
  runAt: z.iso.datetime({ offset: true }),
  repeatWeeks: z.number().int().min(1).max(52).default(1),
  /** 'reach' gives `amount` tokens; 'radio' and 'amplify' send the request by radio (amount is ignored). */
  action: z.enum(['reach', 'radio', 'amplify']).default('reach'),
});

export interface Schedule {
  id: string;
  post_id: string;
  amount: number;
  next_run_at: Date;
  repeat_weeks: number;
  runs: number;
  action: 'reach' | 'radio' | 'amplify';
  status: 'active' | 'done' | 'cancelled' | 'failed';
  error: string | null;
}

const COLS = 'id, post_id, amount, next_run_at, repeat_weeks, runs, action, status, error';

export async function radioEnabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select scheduled_radio_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setRadioEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set scheduled_radio_enabled = $1', [on]);
}

export async function create(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewSchedule>): Promise<Schedule> {
  const post = await posts.getActionable(q, userId, postId);
  if (!post) throw notFound('Post');
  if (input.action !== 'reach' && !(await radioEnabled(q))) throw badRequest('Scheduled radio sends are switched off');
  const runAt = new Date(input.runAt);
  if (runAt.getTime() < Date.now() - 60_000) throw badRequest('Pick a time in the future');
  if (runAt.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * 3600 * 1000) throw badRequest('Pick a time within a year');
  const { rows: n } = await q.query<{ n: number }>(`select count(*)::int as n from public.scheduled_spends where user_id = $1 and status = 'active'`, [userId]);
  if (n[0]!.n >= MAX_ACTIVE_PER_MEMBER) throw conflict(`You can have ${MAX_ACTIVE_PER_MEMBER} scheduled gifts at a time`);
  const { rows } = await q.query<Schedule>(
    `insert into public.scheduled_spends (user_id, post_id, amount, next_run_at, repeat_weeks, action) values ($1, $2, $3, $4, $5, $6) returning ${COLS}`,
    [userId, post.id, input.action === 'reach' ? input.amount : 1, runAt, input.repeatWeeks, input.action],
  );
  return rows[0]!;
}

export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query<Schedule & { excerpt: string }>(
    `select ${COLS.split(', ').map((c) => `s.${c}`).join(', ')}, left(p.body, 80) as excerpt
       from public.scheduled_spends s join public.posts p on p.id = s.post_id
      where s.user_id = $1 order by (s.status = 'active') desc, s.next_run_at limit 100`,
    [userId],
  );
  return rows;
}

export async function cancel(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query(
    `update public.scheduled_spends set status = 'cancelled' where id = $1 and user_id = $2 and status = 'active'`,
    [id, userId],
  );
  if (!rowCount) throw notFound('Scheduled gift');
}

async function finish(q: Queryable, s: Schedule & { user_id: string }, status: 'cancelled' | 'failed', error: string) {
  await q.query('update public.scheduled_spends set status = $2, error = $3 where id = $1', [s.id, status, error]);
  await notifications.notify(q, s.user_id, {
    kind: 'scheduled_spend',
    title: 'A scheduled gift did not go out',
    body: error,
    t: { key: 'scheduled_spend_failed', params: { body: error } },
    data: { postId: s.post_id, scheduleId: s.id },
  });
}

/** Run one due schedule. Exported for tests; the task calls it for each due row. */
export async function runOne(q: Queryable, s: Schedule & { user_id: string }) {
  // Checked again at run time: a block or a community change since scheduling stops the gift.
  const post = await posts.getActionable(q, s.user_id, s.post_id);
  if (!post) return finish(q, s, 'cancelled', 'The request is no longer available.');
  if (await moderation.awaitingCrisisReview(q, post.id)) return; // try again next minute
  try {
    await q.query('savepoint spend');
    if (s.action === 'reach') await tokens.spendOnReach(q, s.user_id, post.id, s.amount, `sched:${s.id}:${s.runs}`);
    else {
      // Switched off since it was set: it stops, and the member is told.
      if (!(await radioEnabled(q))) throw new AppError(409, 'conflict', 'Scheduled radio sends were switched off.');
      await radio.queue(q, s.user_id, post.id, `sched:${s.id}:${s.runs}`, s.action === 'amplify');
    }
    await q.query('release savepoint spend');
  } catch (err) {
    await q.query('rollback to savepoint spend');
    if ((err as { code?: string }).code === 'insufficient_tokens') {
      return finish(q, s, 'failed', s.action === 'reach' ? `You didn't have ${s.amount} tokens when it was time.` : "You didn't have enough Priestly tokens when it was time.");
    }
    // Over the daily radio cap (fair-air.ts) is a busy day, not a reason to stop: this week's send is skipped.
    if (err instanceof AppError && err.code === 'radio_daily_cap') {
      await notifications.notify(q, s.user_id, {
        kind: 'scheduled_spend',
        title: "This week's scheduled radio send was skipped",
        body: err.message,
        data: { postId: s.post_id, scheduleId: s.id },
      });
    }
    // The radio's own other refusals (paused, sensitive, a lament kept off the air, no price set) end the schedule.
    else if (s.action !== 'reach' && err instanceof AppError && err.statusCode < 500) return finish(q, s, 'failed', err.message);
    else throw err;
  }
  const runs = s.runs + 1;
  if (runs >= s.repeat_weeks) {
    await q.query(`update public.scheduled_spends set runs = $2, status = 'done' where id = $1`, [s.id, runs]);
  } else {
    let next = s.next_run_at.getTime() + WEEK_MS;
    while (next <= Date.now()) next += WEEK_MS;
    await q.query('update public.scheduled_spends set runs = $2, next_run_at = $3 where id = $1', [s.id, runs, new Date(next)]);
  }
}

export function runDueTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      await client.query('begin');
      try {
        const { rows } = await client.query<Schedule & { user_id: string }>(
          `select ${COLS}, user_id from public.scheduled_spends where status = 'active' and next_run_at <= now()
            order by next_run_at limit 500 for update skip locked`,
        );
        for (const s of rows) await runOne(client, s);
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
    `select count(*) filter (where created_at >= $1)::int as scheduled, count(*) filter (where status = 'active')::int as active_schedules
       from public.scheduled_spends`,
    [since],
  );
  return rows[0];
}
