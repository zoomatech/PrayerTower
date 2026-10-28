import { afterAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  // Test groups would otherwise show up in "Groups you can join" in the dev app.
  await db.query(`update public.prayer_groups set archived_at = now() where name in ('Cancer prayer circle', 'One') and archived_at is null`);
  await db.end();
});

describe('prayer groups', () => {
  it('lets members chat and keep a shared prayer list', async () => {
    const leader = await createUser('Group Leader');
    const member = await createUser('Group Member');
    const outsider = await createUser('Outsider');
    const res = await as(leader).post('/groups', { name: 'Cancer prayer circle', purpose: 'For families facing cancer.' });
    expect(res.statusCode).toBe(201);
    const { id } = res.json();

    // Public: shows up for others to join.
    expect((await as(member).get('/groups')).json().discover.some((g: { id: string }) => g.id === id)).toBe(true);
    expect((await as(member).post(`/groups/${id}/messages`, { body: 'Hi' })).statusCode).toBe(403);
    await as(member).post(`/groups/${id}/join`);

    const post = await newRequest(outsider, 'Pray for my aunt starting chemo.');
    expect((await as(member).post(`/groups/${id}/prayer-list`, { postId: post.id })).statusCode).toBe(201);
    expect((await as(member).post(`/groups/${id}/prayer-list`, { postId: post.id })).statusCode).toBe(409);

    expect((await as(member).post(`/groups/${id}/messages`, { body: 'Praying for everyone on our list tonight.' })).statusCode).toBe(201);
    await as(member).post(`/groups/${id}/messages`, { body: 'And tomorrow morning.' });
    const notes = (await as(leader).get('/me/notifications')).json().notifications.filter((n: { kind: string }) => n.kind === 'group_message');
    expect(notes).toHaveLength(1);
    expect((await as(leader).get('/groups')).json().mine[0]).toMatchObject({ id, unread: true, members: 2, role: 'leader' });

    const page = (await as(leader).get(`/groups/${id}`)).json();
    expect(page.prayerList.map((c: { id: string }) => c.id)).toEqual([post.id]);
    expect(page.messages.map((m: { body: string }) => m.body)).toEqual(['Praying for everyone on our list tonight.', 'And tomorrow morning.']);
    expect(page.members.map((m: { displayName: string }) => m.displayName)).toEqual(['Group Leader', 'Group Member']);
    expect((await as(leader).get('/groups')).json().mine[0].unread).toBe(false);

    // Group messages are reportable by members only.
    const msgId = page.messages[0].id;
    expect((await as(outsider).post('/reports', { targetType: 'message', targetId: msgId, reason: 'x' })).statusCode).toBe(404);
    expect((await as(leader).post('/reports', { targetType: 'message', targetId: msgId, reason: 'Harmful or abusive' })).statusCode).toBe(201);

    // Only the leader or whoever added a request can take it off.
    expect((await as(leader).delete(`/groups/${id}/prayer-list/${post.id}`)).statusCode).toBe(200);
  });

  it('keeps private groups hidden except by invite code, and hands leadership on', async () => {
    const leader = await createUser('Private Leader');
    const friend = await createUser('Invited Friend');
    const { id } = (await as(leader).post('/groups', { name: 'Family prayers', isPrivate: true })).json();
    expect((await as(friend).get('/groups')).json().discover.some((g: { id: string }) => g.id === id)).toBe(false);
    expect((await as(friend).get(`/groups/${id}`)).statusCode).toBe(404);
    expect((await as(friend).post(`/groups/${id}/join`)).statusCode).toBe(404);
    const code = (await as(leader).get(`/groups/${id}`)).json().group.inviteCode;
    expect((await as(friend).post('/groups/join', { code: 'wrong' })).statusCode).toBe(404);
    expect((await as(friend).post('/groups/join', { code })).json().id).toBe(id);

    await as(leader).post(`/groups/${id}/leave`);
    expect((await as(friend).get(`/groups/${id}`)).json().group.role).toBe('leader');
    await as(friend).post(`/groups/${id}/leave`);
    const { rows } = await db.query('select archived_at from public.prayer_groups where id = $1', [id]);
    expect(rows[0].archived_at).not.toBeNull();
  });

  it('caps how many groups one member leads', async () => {
    const busy = await createUser('Busy Leader');
    await db.query('update public.safety_settings set groups_per_member = 1');
    try {
      expect((await as(busy).post('/groups', { name: 'One' })).statusCode).toBe(201);
      expect((await as(busy).post('/groups', { name: 'Two' })).statusCode).toBe(403);
    } finally {
      await db.query('update public.safety_settings set groups_per_member = 5');
    }
  });
});
