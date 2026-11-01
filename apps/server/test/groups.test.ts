// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, with their own feed.
// The first one, "Cancer survivors", is there from the start, led by Prayer Tower.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set topic_groups_enabled = $1', [v]);
afterAll(async () => {
  await on(true);
  await db.end();
});

const cancer = async (u: string) => (await as(u).get('/topic-groups')).json().groups.find((g: { name: string }) => g.name === 'Cancer survivors');

describe('Groups', () => {
  it('starts with Cancer survivors, which anyone can join, post to, comment on and pray for', async () => {
    const [ann, ben, cy] = [await createUser('Group Ann'), await createUser('Group Ben'), await createUser('Group Cy')];
    const g = await cancer(ann);
    expect(g).toMatchObject({ about: expect.stringContaining('cancer survivors'), joined: false, isLeader: false, leader: null });

    // Reading is open; posting needs joining first.
    expect((await as(ann).get(`/topic-groups/${g.id}`)).statusCode).toBe(200);
    expect((await as(ann).post(`/topic-groups/${g.id}/posts`, { body: 'Hello' })).statusCode).toBe(403);
    expect((await as(ann).post(`/topic-groups/${g.id}/join`)).json()).toEqual({ joined: true });
    expect((await as(ben).post(`/topic-groups/${g.id}/join`)).json()).toEqual({ joined: true });

    const p = await as(ann).post(`/topic-groups/${g.id}/posts`, { body: 'Five years clear this week. Glad to find you all.' });
    expect(p.statusCode).toBe(201);
    const postId = p.json().id as string;
    expect((await as(ben).post(`/topic-group-posts/${postId}/comments`, { body: 'So happy for you!' })).statusCode).toBe(201);
    expect((await as(ben).post(`/topic-group-posts/${postId}/pray`)).json()).toEqual({ prayed: true });
    expect((await as(cy).post(`/topic-group-posts/${postId}/pray`)).statusCode).toBe(403);

    const page = (await as(ben).get(`/topic-groups/${g.id}`)).json();
    expect(page.group).toMatchObject({ name: 'Cancer survivors', joined: true });
    expect(page.posts[0]).toMatchObject({ body: 'Five years clear this week. Glad to find you all.', prayed: 1, prayedByMe: true, canRemove: false });
    expect(page.posts[0].comments[0]).toMatchObject({ body: 'So happy for you!', canRemove: true });

    // Group posts never reach the main feed.
    expect(JSON.stringify((await as(cy).get('/feed')).json())).not.toContain('Five years clear');

    // Only the author, the leader or a moderator takes a post down.
    expect((await as(ben).delete(`/topic-group-posts/${postId}`)).statusCode).toBe(403);
    const mod = await createUser('Group Moderator');
    await grantRole(db, mod, 'moderator', null);
    expect((await as(mod).get(`/topic-groups/${g.id}`)).json().posts[0].canRemove).toBe(true);
    expect((await as(ann).delete(`/topic-group-posts/${postId}`)).json()).toEqual({ removed: true });

    expect((await as(ben).post(`/topic-groups/${g.id}/leave`)).json()).toEqual({ left: true });
    expect((await cancer(ben)).joined).toBe(false);
  });

  it('hides Groups while the admin switch is off', async () => {
    const u = await createUser('Group Switch');
    await on(false);
    try {
      expect((await as(u).get('/topic-groups')).json()).toEqual({ enabled: false, groups: [] });
      expect((await as(u).post('/topic-groups', { name: 'Off group' })).statusCode).toBe(400);
      expect((await as(u).get('/features')).json().features.topicGroups).toBe(false);
    } finally {
      await on(true);
    }
    expect((await as(u).get('/features')).json().features.topicGroups).toBe(true);
  });

  it('lets a member start a group and lead it, and passes it on when they leave', async () => {
    const [lead, other] = [await createUser('Group Leader'), await createUser('Group Other')];
    const made = await as(lead).post('/topic-groups', { name: 'Caregivers', about: 'For those caring for someone they love.' });
    expect(made.statusCode).toBe(201);
    const id = made.json().id as string;
    await as(other).post(`/topic-groups/${id}/join`);
    const postId = (await as(other).post(`/topic-groups/${id}/posts`, { body: 'Long night with Mum.' })).json().id as string;
    const page = (await as(lead).get(`/topic-groups/${id}`)).json();
    expect(page.group).toMatchObject({ isLeader: true, members: 2, leader: { id: lead } });
    expect(page.posts[0].canRemove).toBe(true);
    expect((await as(lead).post(`/topic-groups/${id}/leave`)).statusCode).toBe(200);
    expect((await as(other).get(`/topic-groups/${id}`)).json().group).toMatchObject({ isLeader: true, members: 1 });
    expect((await as(other).delete(`/topic-group-posts/${postId}`)).json()).toEqual({ removed: true });
  });
});
