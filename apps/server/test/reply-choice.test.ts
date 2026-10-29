// Who can reply: the person who asked chooses everyone, only people who prayed or supported,
// or no comments. The author can always add updates; while off, everyone can comment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.conversation_settings set reply_choice_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Who can reply', () => {
  it('is refused while off, and everyone can comment', async () => {
    const [u, other] = [await createUser('Choice Off'), await createUser('Choice Other')];
    const p = await newRequest(u);
    expect((await as(u).put(`/posts/${p.id}/reply-choice`, { audience: 'none' })).statusCode).toBe(400);
    expect((await as(other).get(`/posts/${p.id}/reply-choice`)).json()).toMatchObject({ enabled: false, canComment: true });
    expect((await as(other).post(`/posts/${p.id}/comments`, { body: 'Praying for you.' })).statusCode).toBe(201);
  });

  it('lets only people who prayed comment, then nobody but the author', async () => {
    await on(true);
    const [u, prayer, stranger] = [await createUser('Choice Asker'), await createUser('Choice Prayer'), await createUser('Choice Stranger')];
    const p = await newRequest(u);
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [p.id, prayer]);
    expect((await as(stranger).put(`/posts/${p.id}/reply-choice`, { audience: 'none' })).statusCode).toBe(403);
    expect((await as(u).put(`/posts/${p.id}/reply-choice`, { audience: 'supporters' })).json()).toMatchObject({ audience: 'supporters', canComment: true, isMine: true });
    expect((await as(stranger).get(`/posts/${p.id}/reply-choice`)).json()).toMatchObject({ audience: 'supporters', canComment: false });
    expect((await as(stranger).post(`/posts/${p.id}/comments`, { body: 'Hello there.' })).statusCode).toBe(403);
    expect((await as(prayer).post(`/posts/${p.id}/comments`, { body: 'Praying for you.' })).statusCode).toBe(201);

    await as(u).put(`/posts/${p.id}/reply-choice`, { audience: 'none' });
    expect((await as(prayer).post(`/posts/${p.id}/comments`, { body: 'Still praying.' })).statusCode).toBe(403);
    expect((await as(u).post(`/posts/${p.id}/comments`, { body: 'An update: surgery went well.', isUpdate: true })).statusCode).toBe(201);
  });
});
