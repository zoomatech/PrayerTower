import { afterAll, describe, expect, it } from 'vitest';
import { streaks } from '../src/modules/prayer-stats/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('prayer streaks', () => {
  it('counts days in a row up to today, or yesterday if not yet today', () => {
    expect(streaks([], '2026-10-28')).toEqual({ currentStreak: 0, longestStreak: 0 });
    expect(streaks(['2026-10-26', '2026-10-27', '2026-10-28'], '2026-10-28')).toEqual({ currentStreak: 3, longestStreak: 3 });
    // Not prayed yet today: yesterday's run still counts.
    expect(streaks(['2026-10-26', '2026-10-27'], '2026-10-28')).toEqual({ currentStreak: 2, longestStreak: 2 });
    // A missed day ends the run; the longest is kept.
    expect(streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-26'], '2026-10-28')).toEqual({ currentStreak: 0, longestStreak: 4 });
    expect(streaks(['2026-12-31', '2027-01-01'], '2027-01-01')).toEqual({ currentStreak: 2, longestStreak: 2 });
  });
});

describe('prayer stats on Me', () => {
  it("shows the member's own days, people and streak, and can be turned off", async () => {
    const me = await createUser('Steady Stephen');
    const a = await createUser('Asker Anna');
    const b = await createUser('Asker Ben');
    const pa = await newRequest(a, 'Pray for my mother.');
    const pb = await newRequest(b, 'Pray for my job.');
    const mine = await newRequest(me, 'Pray for me too.');
    const prayed = new Date();
    for (const [post, daysAgo] of [[pa.id, 0], [pa.id, 1], [pb.id, 1], [mine.id, 3]] as const) {
      await db.query(`insert into public.prayer_events (post_id, user_id, kind, created_at) values ($1, $2, 'praying_now', $3)`, [
        post,
        me,
        new Date(prayed.getTime() - daysAgo * 86_400_000),
      ]);
    }
    const stats = (await as(me).get('/me/prayer-stats?tz=UTC')).json().stats;
    expect(stats).toMatchObject({ enabled: true, daysPrayed: 3, peoplePrayedFor: 2, requestsPrayedFor: 3, currentStreak: 2, longestStreak: 2 });
    expect(stats.week).toHaveLength(7);
    expect(stats.week.map((d: { prayed: boolean }) => d.prayed)).toEqual([false, false, false, true, false, true, true]);
    expect((await as(me).get('/me/prayer-stats?tz=Mars/Olympus')).statusCode).toBe(400);

    await as(me).patch('/me', { showPrayerStats: false });
    expect((await as(me).get('/me/prayer-stats')).json().stats).toMatchObject({ enabled: false, daysPrayed: 0, week: [] });
  });
});
