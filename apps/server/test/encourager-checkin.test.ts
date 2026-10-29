// Encourager check-in: two weeks into a pairing, each side gets one quiet "How is it going?".
// Answers stay private; "I'd like a change" ends the pairing and the newcomer is never
// matched with the same person again. Admins see totals only.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as practices from '../src/modules/practices/index.js';
import { as, createUser, db } from './helpers.js';

const set = (encourager: boolean, checkin: boolean) =>
  db.query('update public.practice_settings set encourager_enabled = $1, encourager_checkin_enabled = $2, encourager_checkin_days = 14, newcomer_days = 30, encourager_days = 30', [
    encourager,
    checkin,
  ]);
const run = () => practices.checkInDueTask(db)({}, {} as JobHelpers);
const notices = async (userId: string) =>
  (await db.query<{ title: string }>("select title from public.notifications where user_id = $1 and kind = 'encourager_checkin'", [userId])).rows;

beforeAll(() => set(false, false));
afterAll(async () => {
  await set(false, false);
  await db.end();
});

describe('Encourager check-in', () => {
  it('asks both sides once after two weeks, and a change finds someone new', async () => {
    await set(true, true);
    await db.query('delete from public.encourager_volunteers');
    await db.query('delete from public.encourager_checkins');
    const [newcomer, first, second, admin] = [await createUser('Check New'), await createUser('Check First'), await createUser('Check Second'), await createUser('Check Admin')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    await as(first).put('/me/encourager/volunteer', { on: true, agree: true });
    const asked = (await as(newcomer).post('/me/encourager/ask')).json();
    expect(asked.matched).toBe(true);
    const matchId = asked.matches[0].id as string;
    expect(asked.matches[0].checkInDue).toBe(false);

    await run();
    expect(await notices(newcomer)).toHaveLength(0);
    await db.query("update public.encourager_matches set started_at = now() - interval '15 days' where id = $1", [matchId]);
    await run();
    await run();
    expect(await notices(newcomer)).toEqual([{ title: 'A quick check-in' }]);
    expect(await notices(first)).toHaveLength(1);
    expect((await as(newcomer).get('/me/encourager')).json().matches[0].checkInDue).toBe(true);

    expect((await as(second).post(`/me/encourager/matches/${matchId}/check-in`, { answer: 'good' })).statusCode).toBe(404);
    const good = (await as(first).post(`/me/encourager/matches/${matchId}/check-in`, { answer: 'good' })).json();
    expect(good.matches[0].checkInDue).toBe(false);
    expect((await as(first).post(`/me/encourager/matches/${matchId}/check-in`, { answer: 'okay' })).statusCode).toBe(409);

    // The newcomer asks for a change: the pairing ends and they can ask again, never for the same person.
    await as(second).put('/me/encourager/volunteer', { on: true, agree: true });
    const changed = (await as(newcomer).post(`/me/encourager/matches/${matchId}/check-in`, { answer: 'change' })).json();
    expect(changed.matches).toEqual([]);
    expect(changed.canAsk).toBe(true);
    const again = (await as(newcomer).post('/me/encourager/ask')).json();
    expect(again.matches[0].other.id).toBe(second);
    // The first encourager is not told.
    expect(await notices(first)).toHaveLength(1);

    expect((await as(admin).get('/admin/encourager-checkins')).json().totals).toEqual({ good: 1, okay: 0, change: 1 });
  });

  it('stays quiet while the check-in switch is off', async () => {
    await set(true, false);
    const r = await createUser('Check Off');
    const res = (await as(r).get('/me/encourager')).json();
    expect(res.enabled).toBe(true);
    expect((await as(r).post(`/me/encourager/matches/00000000-0000-0000-0000-000000000000/check-in`, { answer: 'good' })).statusCode).toBe(400);
  });
});
