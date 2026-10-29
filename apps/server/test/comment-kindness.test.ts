// Comment kindness: the asker's heart on a comment, a private thank-you for a comment,
// and quiet counts. Each is off by default; nothing is ever shown as a public number.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const set = (hearts: boolean, thanks: boolean, quiet: boolean) =>
  db.query('update public.conversation_settings set author_hearts_enabled = $1, comment_thanks_enabled = $2, quiet_counts_enabled = $3', [hearts, thanks, quiet]);
const notices = async (userId: string, kind: string) =>
  (await db.query<{ title: string; body: string }>('select title, body from public.notifications where user_id = $1 and kind = $2', [userId, kind])).rows;

async function thread() {
  const [asker, friend, other] = [await createUser('Heart Asker'), await createUser('Heart Friend'), await createUser('Heart Other')];
  const post = await newRequest(asker);
  const c = (await as(friend).post(`/posts/${post.id}/comments`, { body: `Holding you close ${Math.random()}` })).json().comment;
  return { asker, friend, other, post, commentId: c.id as string };
}

beforeAll(() => set(false, false, false));
afterAll(async () => {
  await set(false, false, false);
  await db.end();
});

describe('Comment kindness', () => {
  it('is refused while off', async () => {
    const t = await thread();
    expect((await as(t.asker).put(`/comments/${t.commentId}/heart`, { on: true })).statusCode).toBe(400);
    expect((await as(t.other).post(`/comments/${t.commentId}/thanks`)).statusCode).toBe(400);
    expect((await as(t.other).get(`/posts/${t.post.id}/comment-kindness`)).json()).toEqual({ hearts: [], thanked: [] });
  });

  it("lets only the asker heart a comment, and tells the commenter once, quietly", async () => {
    await set(true, false, false);
    const t = await thread();
    expect((await as(t.other).put(`/comments/${t.commentId}/heart`, { on: true })).statusCode).toBe(403);
    expect((await as(t.asker).put(`/comments/${t.commentId}/heart`, { on: true })).json()).toEqual({ on: true });
    await as(t.asker).put(`/comments/${t.commentId}/heart`, { on: false });
    await as(t.asker).put(`/comments/${t.commentId}/heart`, { on: true });
    expect(await notices(t.friend, 'author_heart')).toHaveLength(1);
    expect((await as(t.other).get(`/posts/${t.post.id}/comment-kindness`)).json().hearts).toEqual([t.commentId]);
  });

  it('lets anyone thank a commenter once, privately', async () => {
    await set(false, true, false);
    const t = await thread();
    expect((await as(t.friend).post(`/comments/${t.commentId}/thanks`)).statusCode).toBe(400);
    expect((await as(t.other).post(`/comments/${t.commentId}/thanks`)).statusCode).toBe(200);
    expect((await as(t.other).post(`/comments/${t.commentId}/thanks`)).statusCode).toBe(409);
    expect(await notices(t.friend, 'comment_thanks')).toEqual([{ title: 'Heart Other thanked you', body: 'Heart Other thanked you for your comment.' }]);
    expect((await as(t.other).get(`/posts/${t.post.id}/comment-kindness`)).json().thanked).toEqual([t.commentId]);
    expect((await as(t.asker).get(`/posts/${t.post.id}/comment-kindness`)).json().thanked).toEqual([]);
  });

  it('keeps quiet counts as each member chooses', async () => {
    const u = await createUser('Quiet Counts');
    expect((await as(u).put('/me/quiet-counts', { hideMine: true })).statusCode).toBe(400);
    await set(false, false, true);
    expect((await as(u).put('/me/quiet-counts', { hideMine: true })).json()).toEqual({ enabled: true, hideSeen: false, hideMine: true });
    const post = await newRequest(u);
    const viewer = await createUser('Quiet Viewer');
    expect((await as(viewer).get(`/posts/${post.id}`)).json().post.countsQuiet).toBe(true);
  });
});
