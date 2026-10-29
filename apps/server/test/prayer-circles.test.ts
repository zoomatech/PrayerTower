// Prayer circles: an invite-only small group with its own gentle feed. Only members see it,
// only the asker sees how many prayed, others get a quiet heads-up (no push), and a person
// (the author or the circle's starter) is the only one who takes a post down.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set prayer_circles_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Prayer circles', () => {
  it('is refused while off', async () => {
    const u = await createUser('Circle Off');
    expect((await as(u).get('/me/circles')).json()).toEqual({ enabled: false, circles: [] });
    expect((await as(u).post('/circles', { name: 'Tuesday friends' })).statusCode).toBe(400);
  });

  it('invites, joins, posts, prays and replies inside the circle only', async () => {
    await on(true);
    const [owner, friend, stranger] = [await createUser('Circle Owner'), await createUser('Circle Friend'), await createUser('Circle Stranger')];
    const made = await as(owner).post('/circles', { name: 'Tuesday friends', about: 'We pray for each other on Tuesdays.' });
    expect(made.statusCode).toBe(201);
    const id = made.json().id as string;
    expect((await as(stranger).get(`/circles/${id}`)).statusCode).toBe(404);
    expect((await as(friend).post('/circles/join', { code: 'ZZZZZZZZ' })).statusCode).toBe(404);
    const { code } = (await as(owner).post(`/circles/${id}/invite`)).json();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect((await as(friend).post('/circles/join', { code: code.toLowerCase() })).json()).toEqual({ id });
    expect((await as(friend).post(`/circles/${id}/invite`)).statusCode).toBe(403);

    const p = await as(friend).post(`/circles/${id}/posts`, { body: 'Please pray for my job interview on Friday.' });
    expect(p.statusCode).toBe(201);
    const postId = p.json().id as string;
    const heads = await db.query<{ id: string }>("select id from public.notifications where user_id = $1 and kind = 'circle_post'", [owner]);
    expect(heads.rows).toHaveLength(1);
    const pushed = await db.query(`select 1 from graphile_worker._private_jobs where payload ->> 'notificationId' = $1`, [heads.rows[0]!.id]);
    expect(pushed.rowCount).toBe(0);

    expect((await as(owner).post(`/circle-posts/${postId}/pray`)).json()).toEqual({ prayed: true });
    expect((await as(stranger).post(`/circle-posts/${postId}/pray`)).statusCode).toBe(404);
    expect((await as(owner).post(`/circle-posts/${postId}/replies`, { body: 'Praying for calm and clear words.' })).statusCode).toBe(201);

    const asOwner = (await as(owner).get(`/circles/${id}`)).json();
    expect(asOwner.circle).toMatchObject({ name: 'Tuesday friends', isOwner: true });
    expect(asOwner.invite.code).toBe(code);
    expect(asOwner.posts[0]).toMatchObject({ body: 'Please pray for my job interview on Friday.', prayedByMe: true });
    expect(asOwner.posts[0].prayed).toBeUndefined();
    const asFriend = (await as(friend).get(`/circles/${id}`)).json();
    expect(asFriend.invite).toBeNull();
    expect(asFriend.posts[0].prayed).toBe(1);
    expect(asFriend.posts[0].replies[0].body).toBe('Praying for calm and clear words.');

    // Circle posts never reach the main feed.
    const feed = (await as(stranger).get('/feed')).json();
    expect(JSON.stringify(feed)).not.toContain('job interview on Friday');

    expect((await as(stranger).delete(`/circle-posts/${postId}`)).statusCode).toBe(404);
    expect((await as(owner).delete(`/circle-posts/${postId}`)).json()).toEqual({ removed: true });
    expect((await as(owner).get('/me/circles')).json().circles[0]).toMatchObject({ id, members: 2, isOwner: true });
  });

  it('passes the circle on when its starter leaves, and keeps it small', async () => {
    await on(true);
    const owner = await createUser('Circle Starter');
    const id = (await as(owner).post('/circles', { name: 'Small one' })).json().id as string;
    const { code } = (await as(owner).post(`/circles/${id}/invite`)).json();
    const joined: string[] = [];
    for (let i = 0; i < 11; i++) {
      const u = await createUser(`Circle Member ${i}`);
      expect((await as(u).post('/circles/join', { code })).statusCode).toBe(200);
      joined.push(u);
    }
    expect((await as(await createUser('Circle Thirteen')).post('/circles/join', { code })).statusCode).toBe(409);
    expect((await as(owner).delete(`/circles/${id}/members/${joined[10]}`)).json()).toEqual({ removed: true });
    expect((await as(joined[0]!).delete(`/circles/${id}/members/${joined[1]}`)).statusCode).toBe(403);
    await as(owner).post(`/circles/${id}/leave`);
    const r = (await as(joined[0]!).get(`/circles/${id}`)).json();
    expect(r.circle.isOwner).toBe(true);
    expect(r.members).toHaveLength(10);
  });
});
