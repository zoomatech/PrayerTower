import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.live_settings set enabled = false, jitsi_url = null, max_minutes = 180');
  await db.query(`update public.communities set status = 'hidden' where slug = 'open-circle'`);
  await db.end();
});

describe('live video rooms', () => {
  it('is off by default, lets staff start a room, and shows it to the same community', async () => {
    const admin = await createUser('Live Admin');
    await grantRole(db, admin, 'admin', null);
    const pastor = await createUser('Live Pastor');
    await grantRole(db, pastor, 'pastor', null);
    const member = await createUser('Live Member');

    expect((await as(member).get('/live')).json()).toMatchObject({ enabled: false, rooms: [] });
    expect((await as(pastor).post('/live', { title: 'Evening prayer' })).statusCode).toBe(403);

    expect((await as(member).patch('/admin/live-settings', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/live-settings', { jitsiUrl: 'http://insecure.example.org' })).statusCode).toBe(400);
    await as(admin).patch('/admin/live-settings', { enabled: true });

    // Without a video server, hosts must paste a link from an allowed site.
    expect((await as(pastor).post('/live', { title: 'Evening prayer' })).statusCode).toBe(400);
    expect((await as(pastor).post('/live', { title: 'Evening prayer', link: 'https://evil.example.com/x' })).statusCode).toBe(400);
    const linked = await as(pastor).post('/live', { title: 'Evening prayer', link: 'https://zoom.us/j/123' });
    expect(linked.statusCode, linked.body).toBe(201);

    const set = await as(admin).patch('/admin/live-settings', { jitsiUrl: 'https://meet.example.org/' });
    expect(set.json().settings.jitsi_url).toBe('https://meet.example.org');
    const room = await as(pastor).post('/live', { title: 'Bible study' });
    expect(room.json().roomUrl).toMatch(/^https:\/\/meet\.example\.org\/PrayerTower-[A-Za-z0-9_-]{16}$/);

    expect((await as(member).post('/live', { title: 'Mine' })).statusCode).toBe(403);
    const seen = (await as(member).get('/live')).json();
    expect(seen).toMatchObject({ enabled: true, canHost: false, canCreateRoom: true });
    const titles = seen.rooms.map((r: { title: string }) => r.title);
    expect(titles).toEqual(expect.arrayContaining(['Bible study', 'Evening prayer']));

    // Open Circle members don't see the default community's rooms.
    await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
    const secular = await createUser('Live Secular');
    await as(secular).post('/me/community', { slug: 'open-circle' });
    expect((await as(secular).get('/live')).json().rooms.map((r: { id: string }) => r.id)).not.toContain(room.json().id);

    expect((await as(member).post(`/live/${room.json().id}/end`)).statusCode).toBe(403);
    expect((await as(pastor).post(`/live/${room.json().id}/end`)).json()).toEqual({ ended: true });
    expect((await as(member).get('/live')).json().rooms.map((r: { id: string }) => r.id)).not.toContain(room.json().id);
    expect((await as(admin).post(`/live/${linked.json().id}/end`)).json()).toEqual({ ended: true });
  });
});
