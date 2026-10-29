// "Prayer answered" stories: the poster tells how a request turned out in a post of its
// own, linked both ways; the request becomes answered and everyone who prayed hears once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set answered_stories_enabled = $1', [v]);
const story = 'The surgery went well and Dad is home. Thank you all.';

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Answered stories', () => {
  it('is refused while switched off', async () => {
    const u = await createUser('Story Off');
    const p = await newRequest(u);
    expect((await as(u).post(`/posts/${p.id}/answered-story`, { body: story })).statusCode).toBe(400);
  });

  it('posts a linked story, marks the request answered and tells each pray-er once', async () => {
    await on(true);
    const [u, prayer, stranger] = [await createUser('Story Poster'), await createUser('Story Prayer'), await createUser('Story Stranger')];
    const p = await newRequest(u);
    await as(prayer).post(`/posts/${p.id}/pray`, {});
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [p.id, prayer]).catch(() => undefined);
    expect((await as(stranger).post(`/posts/${p.id}/answered-story`, { body: story })).statusCode).toBe(403);
    const r = await as(u).post(`/posts/${p.id}/answered-story`, { body: story });
    expect(r.statusCode).toBe(201);
    const s = r.json().post;
    expect(s).toMatchObject({ postType: 'testimony', body: story, answers: { id: p.id } });
    const original = (await as(u).get(`/posts/${p.id}`)).json().post;
    expect(original).toMatchObject({ state: 'answered', storyId: s.id });
    const { rows } = await db.query<{ data: { postId: string; answeredId: string } }>(`select data from public.notifications where user_id = $1 and kind = 'testimony'`, [prayer]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.data).toMatchObject({ postId: s.id, answeredId: p.id });
    expect((await as(u).post(`/posts/${p.id}/answered-story`, { body: 'Again' })).statusCode).toBe(409);
  });

  it('only a request can have one', async () => {
    await on(true);
    const u = await createUser('Story Praise');
    const res = await as(u).post('/posts', { postType: 'praise', body: 'Grateful today.' });
    expect((await as(u).post(`/posts/${res.json().post.id}/answered-story`, { body: story })).statusCode).toBe(400);
  });
});
