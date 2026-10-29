// Ted Lasso nudges: the private "Who did you lift up this week?", weeks of gratitude
// that only grow, and the Believe flag on answered-prayer notices. All off by default.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const set = (liftUp: boolean, count: boolean, believe: boolean, gratitude = false) =>
  db.query('update public.practice_settings set lift_up_enabled = $1, gratitude_count_enabled = $2, believe_enabled = $3, gratitude_enabled = $4', [
    liftUp,
    count,
    believe,
    gratitude,
  ]);

beforeAll(() => set(false, false, false));
afterAll(async () => {
  await set(false, false, false);
  await db.end();
});

describe('Ted Lasso nudges', () => {
  it('are off by default', async () => {
    const f = await notebook.features(db);
    expect([f.liftUp, f.gratitudeCount, f.believe]).toEqual([false, false, false]);
    const u = await createUser('Lift Off');
    expect((await as(u).get('/me/lift-up?tz=UTC')).json()).toEqual({ enabled: false });
    expect((await as(u).put('/me/lift-up', { body: 'My neighbour', timeZone: 'UTC' })).statusCode).toBe(400);
  });

  it('keeps a private weekly answer to "who did you lift up?"', async () => {
    await set(true, false, false);
    const u = await createUser('Lift Up');
    expect((await as(u).put('/me/lift-up', { body: 'My neighbour, with soup', timeZone: 'UTC' })).json()).toMatchObject({ enabled: true, body: 'My neighbour, with soup' });
    expect((await as(await createUser('Lift Other')).get('/me/lift-up?tz=UTC')).json().body).toBe('');
    expect((await as(u).put('/me/lift-up', { body: '', timeZone: 'UTC' })).json().body).toBe('');
  });

  it('counts weeks of gratitude, ever, and never resets', async () => {
    await set(false, true, false, true);
    const u = await createUser('Grat Count');
    await db.query(`insert into public.gratitude_entries (user_id, week_start, items) values ($1, '2026-01-05', '{a}'), ($1, '2026-03-02', '{b}')`, [u]);
    expect((await as(u).get('/me/gratitude?tz=UTC')).json().weeks).toBe(2);
    await set(false, false, false, true);
    expect((await as(u).get('/me/gratitude?tz=UTC')).json().weeks).toBeNull();
  });

  it('marks the answered notice for a Believe moment', async () => {
    const [poster, prayer] = [await createUser('Believe Poster'), await createUser('Believe Prayer')];
    const notice = async (postId: string) =>
      (await db.query<{ data: Record<string, string> }>(`select data from public.notifications where user_id = $1 and data->>'postId' = $2`, [prayer, postId])).rows[0]!.data;
    const pray = async (body: string) => {
      const p = await newRequest(poster, body);
      await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [p.id, prayer]);
      await as(poster).post(`/posts/${p.id}/answered`, {});
      return p.id;
    };
    expect((await notice(await pray('Please pray for my exam on Friday.'))).believe).toBeUndefined();
    await set(false, false, true);
    expect((await notice(await pray('Please pray for my brother, he starts a new job.'))).believe).toBe('1');
  });
});
