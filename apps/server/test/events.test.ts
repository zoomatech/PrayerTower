import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as events from '../src/modules/events/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('events', () => {
  it('lets a member host a prayer meeting with a video link that only RSVPs see', async () => {
    const host = await createUser('Meeting Host');
    const member = await createUser('Meeting Guest');
    const base = { title: 'Wednesday night prayer', description: 'We pray for the week together.', startsAt: inHours(48) };
    expect((await as(host).post('/events', base)).statusCode).toBe(400); // needs a link or a place
    expect((await as(host).post('/events', { ...base, videoUrl: 'https://evil.example.com/zoom' })).statusCode).toBe(400);
    expect((await as(host).post('/events', { ...base, videoUrl: 'http://zoom.us/j/123' })).statusCode).toBe(400);
    expect((await as(host).post('/events', { ...base, location: 'Online', startsAt: inHours(-2) })).statusCode).toBe(400);

    const res = await as(host).post('/events', { ...base, videoUrl: 'https://us02web.zoom.us/j/123456' });
    expect(res.statusCode).toBe(201);
    const event = res.json().event;
    expect(event).toMatchObject({ kind: 'prayer_meeting', isHost: true, going: 1, myRsvp: 'going', videoUrl: 'https://us02web.zoom.us/j/123456' });

    const seen = (await as(member).get('/events')).json().events.find((e: { id: string }) => e.id === event.id);
    expect(seen).toMatchObject({ videoUrl: null, hasVideo: true, myRsvp: null, host: { name: 'Meeting Host' } });
    const going = (await as(member).put(`/events/${event.id}/rsvp`, { status: 'going' })).json().event;
    expect(going).toMatchObject({ going: 2, myRsvp: 'going', videoUrl: 'https://us02web.zoom.us/j/123456' });
    expect((await as(member).get('/me/events')).json().events.map((e: { id: string }) => e.id)).toContain(event.id);
    expect((await as(member).delete(`/events/${event.id}/rsvp`)).json().event.going).toBe(1);
    expect((await as(host).delete(`/events/${event.id}/rsvp`)).statusCode).toBe(400);
  });

  it('reminds people who are going shortly before it starts, once', async () => {
    const host = await createUser('Soon Host');
    const guest = await createUser('Soon Guest');
    const { event } = (await as(host).post('/events', { title: 'Local meet-up', kind: 'meetup', location: 'Grace Church, Main St', startsAt: inHours(0.25) })).json();
    await as(guest).put(`/events/${event.id}/rsvp`, { status: 'going' });
    expect(await events.sendReminders(db)).toBeGreaterThanOrEqual(2);
    expect(await events.sendReminders(db)).toBe(0);
    const n = (await as(guest).get('/me/notifications')).json().notifications.find((x: { kind: string }) => x.kind === 'event_reminder');
    expect(n.data.eventId).toBe(event.id);
  });

  it('keeps group events inside the group and tells members', async () => {
    const owner = await createUser('Group Event Owner');
    const friend = await createUser('Group Event Friend');
    const outsider = await createUser('Group Event Outsider');
    const { conversationId } = (await as(owner).post('/conversations/groups', { title: 'Family prayer', memberIds: [friend] })).json();
    await as(friend).post(`/conversations/${conversationId}/join`);
    expect((await as(outsider).post('/events', { title: 'x', location: 'Home', startsAt: inHours(5), groupId: conversationId })).statusCode).toBe(403);
    const { event } = (await as(owner).post('/events', { title: 'Family Zoom prayer', videoUrl: 'https://meet.google.com/abc-defg-hij', startsAt: inHours(5), groupId: conversationId })).json();
    expect(event.groupTitle).toBe('Family prayer');
    expect((await as(outsider).get(`/events/${event.id}`)).statusCode).toBe(404);
    expect((await as(outsider).get('/events')).json().events.some((e: { id: string }) => e.id === event.id)).toBe(false);
    expect((await as(friend).get(`/events?groupId=${conversationId}`)).json().events.map((e: { id: string }) => e.id)).toEqual([event.id]);
    expect((await as(friend).get('/me/notifications')).json().notifications.some((n: { kind: string }) => n.kind === 'event_new')).toBe(true);
  });

  it('lets only the host or staff cancel, and tells everyone going', async () => {
    const host = await createUser('Cancel Host');
    const guest = await createUser('Cancel Guest');
    const { event } = (await as(host).post('/events', { title: 'Seminar', kind: 'seminar', location: 'Library', startsAt: inHours(30) })).json();
    await as(guest).put(`/events/${event.id}/rsvp`, {});
    expect((await as(guest).post(`/events/${event.id}/cancel`)).statusCode).toBe(403);
    expect((await as(host).post(`/events/${event.id}/cancel`)).statusCode).toBe(200);
    expect((await as(guest).get('/events')).json().events.some((e: { id: string }) => e.id === event.id)).toBe(false);
    expect((await as(guest).get('/me/notifications')).json().notifications.some((n: { kind: string }) => n.kind === 'event_cancelled')).toBe(true);
  });

  it('lets only staff schedule restorative circles, and events can be reported', async () => {
    const member = await createUser('Circle Member');
    const pastor = await createUser('Circle Pastor');
    await grantRole(db, pastor, 'pastor_counselor', null);
    const circle = { kind: 'circle', title: 'Restorative circle', videoUrl: 'https://zoom.us/j/9', startsAt: inHours(24) };
    expect((await as(member).post('/events', circle)).statusCode).toBe(403);
    const { event } = (await as(pastor).post('/events', circle)).json();
    expect((await as(member).post('/reports', { targetType: 'event', targetId: event.id, reason: 'suspicious' })).statusCode).toBe(201);
    const mod = await createUser('Event Mod');
    await grantRole(db, mod, 'moderator', null);
    const item = (await as(mod).get(`/moderation/queue?targetId=${event.id}`)).json().items.find((i: { target_id: string }) => i.target_id === event.id);
    expect(item.content).toContain('Restorative circle');
  });

  it('can be turned off by an admin', async () => {
    const admin = await createUser('Event Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await as(admin).patch('/admin/event-settings', { eventsEnabled: false })).json().settings.events_enabled).toBe(false);
    expect((await as(admin).post('/events', { title: 'x', location: 'y', startsAt: inHours(3) })).statusCode).toBe(403);
    await as(admin).patch('/admin/event-settings', { eventsEnabled: true });
  });
});
