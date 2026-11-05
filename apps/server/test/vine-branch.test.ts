import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('your branch (Vine 2.0)', () => {
  it('lists only your own posts, newest first, with commitment counts', async () => {
    const me = await createUser('Branch Owner');
    const friend = await createUser('Branch Friend');
    const first = (await as(me).post('/posts', { postType: 'prayer_request', body: 'Please pray for my job interview.' })).json().post.id;
    const second = (await as(me).post('/posts', { postType: 'praise', body: 'The interview went well, thank you.' })).json().post.id;
    await as(friend).post('/posts', { postType: 'prayer_request', body: 'Not on your branch.' });
    expect((await as(friend).post(`/posts/${first}/commitments`, { frequency: 'daily', vowText: 'Every morning' })).statusCode).toBe(201);

    const res = await as(me).get('/me/branch');
    expect(res.statusCode, res.body).toBe(200);
    const ids = res.json().posts.map((p: { id: string }) => p.id);
    expect(ids).toEqual([second, first]);
    expect(res.json().posts[1].counts.commitments).toBe(1);
    expect(res.json().nextPage).toBeNull();
  });

  it('comes a page at a time', async () => {
    const me = await createUser('Branch Pager');
    const made: string[] = [];
    for (let i = 0; i < 3; i++) made.unshift((await as(me).post('/posts', { postType: 'prayer_request', body: `Branch page prayer ${i}.` })).json().post.id);
    const one = (await as(me).get('/me/branch?pageSize=2')).json();
    expect(one.posts.map((p: { id: string }) => p.id)).toEqual(made.slice(0, 2));
    expect(one.nextPage).toBe(1);
    const two = (await as(me).get('/me/branch?page=1&pageSize=2')).json();
    expect(two.posts.map((p: { id: string }) => p.id)).toEqual(made.slice(2));
    expect(two.nextPage).toBeNull();
  });
});
