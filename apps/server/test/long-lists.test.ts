import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

// Steve, 2026-11-05: a popular request opens with 20 conversations and 20 names, then "+ more".
describe('long lists on a request', () => {
  it('sends the first conversations, each with its replies, and how many there are', async () => {
    const poster = await createUser('Lists Poster');
    const friend = await createUser('Lists Friend');
    const post = await newRequest(poster, 'Please pray for the long list of comments.');
    const top: string[] = [];
    for (let i = 0; i < 3; i++) top.push((await as(friend).post(`/posts/${post.id}/comments`, { body: `Praying, note ${i}.` })).json().comment.id);
    await as(poster).post(`/posts/${post.id}/comments`, { body: 'Thank you so much.', parentId: top[0] });

    const all = (await as(friend).get(`/posts/${post.id}/comments`)).json();
    expect(all.comments).toHaveLength(4);
    expect(all.threads).toBeUndefined();

    const first = (await as(friend).get(`/posts/${post.id}/comments?limit=2`)).json();
    expect(first.threads).toBe(3);
    // Two conversations: the first with its reply, then the second.
    expect(first.comments.map((c: { depth: number }) => c.depth)).toEqual([0, 1, 0]);
  });

  it('sends the most recent names who prayed, with everyone counted', async () => {
    const poster = await createUser('Lists Prayed Poster');
    const post = await newRequest(poster, 'Please pray for the long list of names.');
    for (let i = 0; i < 3; i++) {
      const u = await createUser(`Lists Pray-er ${i}`);
      expect((await as(u).post(`/posts/${post.id}/praying-now`, {})).statusCode).toBe(201);
    }
    const some = (await as(poster).get(`/posts/${post.id}/prayers?limit=2`)).json();
    expect(some.count).toBe(3);
    expect(some.people).toHaveLength(2);
    expect(some.people[0].displayName).toBe('Lists Pray-er 2');
    const all = (await as(poster).get(`/posts/${post.id}/prayers`)).json();
    expect(all.people).toHaveLength(3);
  });

  it('thanks everyone who prayed in one go', async () => {
    const poster = await createUser('Lists Thanker');
    const post = await newRequest(poster, 'Please pray for the thank-you test.');
    const pray = await Promise.all([0, 1].map((i) => createUser(`Lists Thanked ${i}`)));
    for (const u of pray) await as(u).post(`/posts/${post.id}/praying-now`, {});
    const r = await as(poster).post(`/posts/${post.id}/thanks`, { message: 'Thank you both.' });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const { rows } = await db.query('select recipient_id, message from public.thanks where post_id = $1 order by recipient_id', [post.id]);
    expect(rows.map((x) => x.recipient_id).sort()).toEqual([...pray].sort());
    expect(rows.every((x) => x.message === 'Thank you both.')).toBe(true);
  });
});
