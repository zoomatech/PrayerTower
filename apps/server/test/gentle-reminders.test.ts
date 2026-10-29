// Gentle reminders (Admin → Gentle reminders): a daily reminder at the member's
// own time that is skipped on a day they prayed, never mentions a missed day,
// slows to weekly after a quiet stretch, and weeks of prayer in place of a streak.
import type { JobHelpers } from 'graphile-worker';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as reminders from '../src/modules/reminders/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|blessed)\b/i;
const GUILT = /\b(miss\w*|streak|lose|lost|behind|broke\w*|again|forgot\w*|yet)\b/i;

const helpers = {
  logger: { warn: () => undefined },
  withPgClient: async <T>(fn: (c: PoolClient) => Promise<T>) => {
    const c = await db.connect();
    try {
      return await fn(c);
    } finally {
      c.release();
    }
  },
} as unknown as JobHelpers;
const run = () => reminders.dueTask()({}, helpers);

beforeAll(() => db.query('update public.reminder_settings set daily_reminder_enabled = true, gentle_streak_enabled = true, quiet_after = 3'));
afterAll(async () => {
  await db.query('update public.reminder_settings set daily_reminder_enabled = false, gentle_streak_enabled = false, quiet_after = 7');
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

const notices = async (userId: string) =>
  (await db.query<{ title: string; body: string }>(`select title, body from public.notifications where user_id = $1 and kind = 'daily_reminder' order by created_at`, [userId])).rows;
const due = (userId: string, extra = '') => db.query(`update public.daily_reminders set next_at = now() - interval '1 minute'${extra} where user_id = $1`, [userId]);
const everyDay = { hour: 8, minute: 0, days: [0, 1, 2, 3, 4, 5, 6], timeZone: 'UTC' };

describe('reminder times', () => {
  it('finds the next chosen day and time in the member’s time zone, across a clock change', () => {
    // 09:00 EST on Saturday 7 March 2026; clocks go forward that night.
    const after = new Date('2026-03-07T14:00:00Z');
    expect(reminders.nextAt(8, 0, [0, 1, 2, 3, 4, 5, 6], 'America/New_York', after).toISOString()).toBe('2026-03-08T12:00:00.000Z');
    expect(reminders.nextAt(10, 30, [6], 'America/New_York', after).toISOString()).toBe('2026-03-07T15:30:00.000Z');
    expect(reminders.nextAt(7, 15, [1], 'Europe/London', new Date('2026-10-28T12:00:00Z')).toISOString()).toBe('2026-11-02T07:15:00.000Z');
    expect(reminders.validZone('Mars/Olympus')).toBe(false);
  });

  it('counts weeks of prayer, allowing one rest week, and hides a run under 2', () => {
    const today = '2026-10-29'; // a Thursday
    expect(reminders.weeksOfPrayer([], today)).toEqual({ weeksPrayed: 0, weekRun: null });
    expect(reminders.weeksOfPrayer(['2026-10-27'], today)).toEqual({ weeksPrayed: 1, weekRun: null });
    // This week, last week, a rest week, then the week before.
    expect(reminders.weeksOfPrayer(['2026-10-26', '2026-10-20', '2026-10-21', '2026-10-06'], today)).toEqual({ weeksPrayed: 3, weekRun: 3 });
    // Nothing yet this week still keeps last week's run; two rest weeks end it, the total stays.
    expect(reminders.weeksOfPrayer(['2026-10-22', '2026-10-15', '2026-09-24'], today)).toEqual({ weeksPrayed: 3, weekRun: 2 });
  });
});

describe('daily reminder', () => {
  it('is set, read and turned off by the member, and only while switched on', async () => {
    const me = await createUser('Reminder Setter');
    expect((await as(me).put('/me/daily-reminder', { ...everyDay, timeZone: 'Mars/Olympus' })).statusCode).toBe(400);
    expect((await as(me).put('/me/daily-reminder', { ...everyDay, days: [] })).statusCode).toBe(400);
    const set = (await as(me).put('/me/daily-reminder', { ...everyDay, days: [5, 1, 1] })).json();
    expect(set.reminder).toMatchObject({ hour: 8, minute: 0, days: [1, 5], timeZone: 'UTC' });
    expect((await as(me).get('/me/daily-reminder')).json().reminder.days).toEqual([1, 5]);
    expect((await as(me).put('/me/daily-reminder', { off: true })).json()).toEqual({ enabled: true, reminder: null });

    await db.query('update public.reminder_settings set daily_reminder_enabled = false');
    try {
      expect((await as(me).get('/me/daily-reminder')).json()).toEqual({ enabled: false });
      expect((await as(me).put('/me/daily-reminder', everyDay)).statusCode).toBe(403);
    } finally {
      await db.query('update public.reminder_settings set daily_reminder_enabled = true');
    }
  });

  it('sends one kind reminder a day, and none on a day they already prayed', async () => {
    const me = await createUser('Reminder Daily');
    await as(me).put('/me/daily-reminder', everyDay);
    await due(me);
    await run();
    const [first] = await notices(me);
    expect(first).toBeDefined();
    expect(`${first!.title} ${first!.body}`).not.toMatch(GUILT);
    const { rows } = await db.query<{ next_at: Date }>('select next_at from public.daily_reminders where user_id = $1', [me]);
    expect(rows[0]!.next_at.getTime()).toBeGreaterThan(Date.now());

    // Due again the same day: never twice.
    await due(me);
    await run();
    expect(await notices(me)).toHaveLength(1);

    const other = await createUser('Reminder Poster');
    const post = await newRequest(other);
    const prayed = await createUser('Reminder Prayed');
    await as(prayed).put('/me/daily-reminder', everyDay);
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, prayed]);
    await due(prayed);
    await run();
    expect(await notices(prayed)).toHaveLength(0);
  });

  it('rests to once a week after unused reminders, and comes back when they pray', async () => {
    const me = await createUser('Reminder Quiet');
    await as(me).put('/me/daily-reminder', everyDay);
    // Three reminders went by with no prayer; the last was yesterday.
    await due(me, `, unanswered = 2, last_sent_at = now() - interval '1 day'`);
    await run();
    expect(await notices(me)).toHaveLength(0);
    expect((await db.query('select unanswered from public.daily_reminders where user_id = $1', [me])).rows[0].unanswered).toBe(3);

    // A week after the last one, it sends again.
    await due(me, `, last_sent_at = now() - interval '7 days'`);
    await run();
    expect(await notices(me)).toHaveLength(1);

    // They prayed after that reminder: back to their own days.
    const other = await createUser('Reminder Poster 2');
    const post = await newRequest(other);
    await db.query(`insert into public.prayer_events (post_id, user_id, kind, created_at) values ($1, $2, 'praying_now', now() - interval '1 day')`, [post.id, me]);
    await db.query(`update public.notifications set dedupe_key = null where user_id = $1`, [me]);
    await db.query(`update public.daily_reminders set last_sent_at = now() - interval '2 days' where user_id = $1`, [me]);
    await due(me);
    await run();
    expect(await notices(me)).toHaveLength(2);
    expect((await db.query('select unanswered from public.daily_reminders where user_id = $1', [me])).rows[0].unanswered).toBe(0);
  });

  it('uses Open Circle wording for Open Circle members', async () => {
    const admin = await createUser('Reminder OC Admin');
    await grantRole(db, admin, 'admin', null);
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const me = await createUser('Reminder OC');
    await as(me).post('/me/community', { slug: 'open-circle' });
    await as(me).put('/me/daily-reminder', everyDay);
    await due(me);
    await run();
    const [n] = await notices(me);
    expect(n).toBeDefined();
    expect(`${n!.title} ${n!.body}`).not.toMatch(RELIGIOUS);
    expect(`${n!.title} ${n!.body}`).not.toMatch(GUILT);
  });

  it('lets only admins switch it on and set the quiet stretch', async () => {
    const plain = await createUser('Reminder Plain');
    expect((await as(plain).get('/admin/reminder-settings')).statusCode).toBe(403);
    const admin = await createUser('Reminder Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await as(admin).patch('/admin/reminder-settings', { quietAfter: 1 })).statusCode).toBe(400);
    const r = await as(admin).patch('/admin/reminder-settings', { quietAfter: 5 });
    expect(r.json().settings).toMatchObject({ daily_reminder_enabled: true, quiet_after: 5 });
    expect((await as(plain).get('/me/prayer-stats?tz=UTC')).json().stats).toMatchObject({ weeksPrayed: 0, weekRun: null });
  });
});
