// The member safety center (docs/SAFETY_CENTER.md): report, block, mute and hide in one
// place, each undoable, in both editions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as center from '../src/modules/safety-center/index.js';
import { as, createUser, db } from './helpers.js';

const was = await center.enabled(db);
let admin: string;

beforeAll(async () => {
  admin = await createUser('Center Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
});
afterAll(async () => {
  await center.setEnabled(db, was);
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.end();
});

// Every post the member can see, across all pages: the feed is ranked, so new posts need not be on page one.
async function feedIds(who: string): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 0; page < 20; page++) {
    const posts: { id: string }[] = (await as(who).get(`/feed?page=${page}&pageSize=50`)).json().posts;
    ids.push(...posts.map((p) => p.id));
    if (posts.length < 50) break;
  }
  return ids;
}

describe('safety center', () => {
  it('is off by default; only admins switch it', async () => {
    expect(was).toBe(false);
    const m = await createUser('Center Early');
    expect((await as(m).get('/me/safety')).statusCode).toBe(403);
    expect((await as(m).put(`/people/${admin}/mute`, {})).statusCode).toBe(403);
    expect((await as(m).patch('/admin/safety-center', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/safety-center', { enabled: true })).json()).toEqual({ enabled: true });
    expect((await as(m).get('/features')).json().features.safetyCenter).toBe(true);
  });

  it.each([
    { edition: 'Prayer Tower', slug: null },
    { edition: 'Open Circle', slug: 'open-circle' },
  ])('mutes quietly, lists blocks, mutes, hidden posts and reports, and undoes each: $edition', async ({ slug }) => {
    const me = await createUser(`Center Me ${slug ?? 'pt'}`);
    const loud = await createUser(`Center Loud ${slug ?? 'pt'}`);
    const rude = await createUser(`Center Rude ${slug ?? 'pt'}`);
    if (slug) for (const u of [me, loud, rude]) await as(u).post('/me/community', { slug });

    const loudPost = (await as(loud).post('/posts', { postType: 'prayer_request', body: 'Please pray for my exams this week.' })).json().post;
    const rudePost = (await as(rude).post('/posts', { postType: 'prayer_request', body: 'Please pray for my job interview.' })).json().post;
    expect(await feedIds(me)).toEqual(expect.arrayContaining([loudPost.id, rudePost.id]));

    // Mute: their posts and comments leave my feed; they are not told and can still see mine.
    expect((await as(me).put(`/people/${loud}/mute`, {})).json()).toEqual({ muted: true });
    expect((await as(me).put(`/people/${me}/mute`, {})).statusCode).toBe(400);
    expect(await feedIds(me)).not.toContain(loudPost.id);
    expect((await db.query(`select 1 from public.notifications where user_id = $1 and body ilike '%mute%'`, [loud])).rowCount).toBe(0);
    await as(loud).post(`/posts/${rudePost.id}/comments`, { body: 'Praying for you!' });
    const comments = (await as(me).get(`/posts/${rudePost.id}/comments`)).json().comments;
    expect(comments.some((c: { body: string }) => c.body === 'Praying for you!')).toBe(false);

    // Hide one post, block one person, report one post.
    expect((await as(me).put(`/posts/${rudePost.id}/hide`, {})).statusCode).toBe(200);
    expect((await as(me).put(`/people/${rude}/block`, {})).statusCode).toBe(200);
    expect((await as(me).post('/reports', { targetType: 'post', targetId: rudePost.id, reason: 'Rude' })).statusCode).toBe(201);

    const s = (await as(me).get('/me/safety')).json().safety;
    expect(s.mutes.map((x: { id: string }) => x.id)).toEqual([loud]);
    expect(s.blocks.map((x: { id: string }) => x.id)).toEqual([rude]);
    expect(s.hidden.map((x: { id: string }) => x.id)).toEqual([rudePost.id]);
    expect(s.reports).toHaveLength(1);
    expect(s.reports[0]).toMatchObject({ targetType: 'post', reviewed: false });

    // Undo each.
    expect((await as(me).delete(`/people/${loud}/mute`)).json()).toEqual({ muted: false });
    expect(await feedIds(me)).toContain(loudPost.id);
    await as(me).delete(`/people/${rude}/block`);
    await as(me).delete(`/posts/${rudePost.id}/hide`);
    const after = (await as(me).get('/me/safety')).json().safety;
    expect([after.mutes, after.blocks, after.hidden]).toEqual([[], [], []]);
  });
});
