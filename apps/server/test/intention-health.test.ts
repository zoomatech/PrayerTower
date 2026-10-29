// Weekly intention (a member's own days-a-week aim, with rest built in, never "missed") and
// community health (admin totals of requests held, answers and members who came back).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { health } from '../src/modules/kindness-weather/index.js';
import { intentionFor } from '../src/modules/prayer-stats/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const set = (col: string, v: boolean) => db.query(`update public.practice_settings set ${col} = $1`, [v]);

beforeAll(async () => {
  await set('weekly_intention_enabled', false);
  await set('community_health_enabled', false);
});
afterAll(async () => {
  await set('weekly_intention_enabled', false);
  await set('community_health_enabled', false);
  await db.end();
});

describe('Weekly intention', () => {
  it('counts this week from Monday and says only when it is met', () => {
    // 2026-10-29 is a Thursday.
    const i = intentionFor(3, ['2026-10-25', '2026-10-26', '2026-10-28'], '2026-10-29');
    expect(i.week.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(i).toMatchObject({ days: 3, shown: 2, met: false });
    expect(intentionFor(2, ['2026-10-26', '2026-10-28'], '2026-10-29').met).toBe(true);
    expect(intentionFor(null, ['2026-10-26'], '2026-10-29').met).toBe(false);
  });

  it('is absent while off, then lets a member choose 1 to 6 days', async () => {
    const me = await createUser('Intention Member');
    expect((await as(me).get('/me/prayer-stats?tz=UTC')).json().stats.intention).toBeUndefined();
    expect((await as(me).put('/me/weekly-intention', { days: 3 })).statusCode).toBe(400);
    await set('weekly_intention_enabled', true);
    expect((await as(me).get('/me/prayer-stats?tz=UTC')).json().stats.intention).toMatchObject({ days: null, shown: 0, met: false });
    expect((await as(me).put('/me/weekly-intention', { days: 7 })).statusCode).toBe(400);
    const post = await newRequest(await createUser('Intention Asker'));
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, me]);
    const r = (await as(me).put('/me/weekly-intention', { days: 1, tz: 'UTC' })).json().stats.intention;
    expect(r).toMatchObject({ days: 1, shown: 1, met: true });
    expect((await as(me).put('/me/weekly-intention', { days: null })).json().stats.intention.days).toBeNull();
  });
});

describe('Community health', () => {
  it('is for admins, off until switched on, and folds quiet weeks', async () => {
    const [admin, member] = [await createUser('Health Admin'), await createUser('Health Member')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    expect((await as(member).get('/admin/community-health')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/community-health')).json()).toEqual({ enabled: false, weeks: [] });
    await set('community_health_enabled', true);
    const askers = await Promise.all([1, 2, 3, 4, 5].map((n) => createUser(`Health Asker ${n}`)));
    const posts = await Promise.all(askers.map((a) => newRequest(a, 'Please pray for my sister this week.')));
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [posts[0]!.id, member]);
    const r = await health(db, 4);
    expect(r.weeks).toHaveLength(4);
    const now = r.weeks[0]!;
    expect(Object.keys(now).sort()).toEqual(['answered', 'held', 'requests', 'returning', 'weekStart']);
    expect(now.requests).toBeGreaterThanOrEqual(5);
    expect(now.held).toBeGreaterThanOrEqual(1);
    expect(now.held!).toBeLessThanOrEqual(now.requests!);
    for (const w of r.weeks) if (w.requests === null) expect(w.returning).toBeNull();
    expect((await as(admin).get('/admin/community-health?weeks=4')).json().weeks).toHaveLength(4);
  });
});
