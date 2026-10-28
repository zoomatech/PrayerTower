import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('not for me', () => {
  it('hides a post from my feed only, and can bring it back', async () => {
    const me = await createUser('Ethel Hides');
    const other = await createUser('Other Reader');
    const poster = await createUser('Sports Fan');
    const post = await newRequest(poster, 'Pray my team wins the big game on Sunday!');
    const inFeed = async (u: string) => {
      for (let page = 0; page < 5; page++) {
        const posts = (await as(u).get(`/feed?page=${page}`)).json().posts as { id: string }[];
        if (posts.some((p) => p.id === post.id)) return true;
        if (!posts.length) break;
      }
      return false;
    };
    expect(await inFeed(me)).toBe(true);
    expect((await as(me).put(`/posts/${post.id}/hide`)).json()).toEqual({ hidden: true });
    expect(await inFeed(me)).toBe(false);
    expect(await inFeed(other)).toBe(true);
    // Still reachable by link.
    expect((await as(me).get(`/posts/${post.id}`)).statusCode).toBe(200);
    await as(me).delete(`/posts/${post.id}/hide`);
    expect(await inFeed(me)).toBe(true);
  });
});
