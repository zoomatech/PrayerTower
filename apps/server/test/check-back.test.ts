// Gentle "check back": the asker picks a reminder day and gets one soft reminder then;
// their update gives everyone who prayed one quiet in-app heads-up a day, with no push.
import type { JobHelpers } from 'graphile-worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as checkBack from '../src/modules/check-back/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set check_back_enabled = $1', [v]);
const run = () => checkBack.dueTask(db)({}, {} as JobHelpers);
const notices = async (userId: string, kind: string) =>
  (await db.query<{ id: string; body: string }>('select id, body from public.notifications where user_id = $1 and kind = $2', [userId, kind])).rows;
const pushes = async (ids: string[]) =>
  (await db.query(`select 1 from graphile_worker._private_jobs where payload ->> 'notificationId' = any($1)`, [ids])).rowCount;

async function prayed(poster: string, prayer: string) {
  const post = await newRequest(poster);
  await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [post.id, prayer]);
  return post;
}

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Check back', () => {
  it('is refused while off, and an update tells no one', async () => {
    const [poster, prayer] = [await createUser('Check Off'), await createUser('Check Off Prayer')];
    const post = await prayed(poster, prayer);
    expect((await as(poster).put(`/posts/${post.id}/check-back`, { days: 3 })).statusCode).toBe(400);
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'An update while off.', isUpdate: true });
    expect(await notices(prayer, 'check_back_update')).toEqual([]);
  });

  it('reminds the asker once, on the day they picked', async () => {
    await on(true);
    const [poster, prayer, other] = [await createUser('Check Poster'), await createUser('Check Prayer'), await createUser('Check Other')];
    const post = await prayed(poster, prayer);
    expect((await as(other).put(`/posts/${post.id}/check-back`, { days: 3 })).statusCode).toBe(403);
    expect((await as(poster).put(`/posts/${post.id}/check-back`, { days: 5 })).statusCode).toBe(400);
    const r = await as(poster).put(`/posts/${post.id}/check-back`, { days: 3 });
    expect(r.json().dueAt).toBeTruthy();
    await run();
    expect(await notices(poster, 'check_back')).toEqual([]);
    await db.query(`update public.check_backs set due_at = now() - interval '1 minute' where post_id = $1`, [post.id]);
    await run();
    await run();
    const sent = await notices(poster, 'check_back');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatch(/1 person prayed.*No pressure/);
    expect((await as(poster).get(`/posts/${post.id}/check-back`)).json()).toEqual({ enabled: true, dueAt: null });
  });

  it('gives each pray-er one quiet heads-up a day, with no push and no words', async () => {
    await on(true);
    const [poster, prayer] = [await createUser('Update Poster'), await createUser('Update Prayer')];
    const post = await prayed(poster, prayer);
    await as(poster).put(`/posts/${post.id}/check-back`, { days: 7 });
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Scan results are good so far.', isUpdate: true });
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Second update the same day.', isUpdate: true });
    const got = await notices(prayer, 'check_back_update');
    expect(got).toHaveLength(1);
    expect(got[0]!.body).toBe('Update Poster shared an update on a request you prayed for.');
    expect(await pushes(got.map((n) => n.id))).toBe(0);
    // The update did what the reminder was for.
    expect((await as(poster).get(`/posts/${post.id}/check-back`)).json().dueAt).toBeNull();
    expect(await notices(poster, 'check_back_update')).toEqual([]);
  });
});
