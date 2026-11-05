import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

const ids = (r: { json: () => { posts: { id: string }[] } }) => r.json().posts.map((p) => p.id);

describe('feed paging', () => {
  it('keeps the order the feed opened in, so scrolling never repeats a post', async () => {
    const reader = await createUser('Paging Reader');
    const poster = await createUser('Paging Poster');
    for (let i = 0; i < 6; i++) await newRequest(poster, `Please pray for paging day ${i} of the week.`);
    const first = ids(await as(reader).get('/feed?page=0&pageSize=3'));
    expect(first).toHaveLength(3);
    // A new post would rank first if pages were ranked afresh, pushing page 0's last post onto page 1.
    const late = await newRequest(poster, 'Please pray for the post made while I was scrolling.');
    const second = ids(await as(reader).get('/feed?page=1&pageSize=3'));
    expect(second.filter((id) => first.includes(id))).toEqual([]);
    expect(second).not.toContain(late.id);
    // Opening the feed again (page 0) ranks again and shows the new post.
    const all: string[] = [];
    for (let page = 0; page < 200; page++) {
      const r = await as(reader).get(`/feed?page=${page}&pageSize=50`);
      all.push(...ids(r));
      if (r.json().nextPage === null) break;
    }
    expect(all).toContain(late.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('drops a post hidden after the feed opened from later pages', async () => {
    const reader = await createUser('Paging Hider');
    const poster = await createUser('Paging Poster Two');
    for (let i = 0; i < 4; i++) await newRequest(poster, `Please pray for hiding test ${i} today.`);
    const first = ids(await as(reader).get('/feed?page=0&pageSize=2'));
    expect(first).toHaveLength(2);
    const target = ids(await as(reader).get('/feed?page=1&pageSize=2'))[0]!;
    await as(reader).put(`/posts/${target}/hide`);
    // Page 1 again, from the same saved order: the hidden post is gone.
    expect(ids(await as(reader).get('/feed?page=1&pageSize=2'))).not.toContain(target);
  });
});
