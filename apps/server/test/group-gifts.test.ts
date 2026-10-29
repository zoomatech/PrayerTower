// Gifts to a prayer group or a meet-up: off by default, split evenly among the others
// there (never the giver, never across a block), each share an ordinary ledger gift.
import { afterAll, describe, expect, it } from 'vitest';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set group_gifts_enabled = false');
  await db.end();
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Gifts to groups and meet-ups', () => {
  it('splits a gift among a group and an event, honoring blocks', async () => {
    const giver = await createUser('Group Giver');
    const a = await createUser('Group A');
    const b = await createUser('Group B');
    const blocked = await createUser('Group Blocked');
    await tokens.earn(db, giver, 40, `test:${giver}`, 'test');

    const { conversationId } = (await as(giver).post('/conversations/groups', { title: 'Gift circle', isPublic: true })).json();
    for (const u of [a, b, blocked]) await as(u).post(`/conversations/${conversationId}/join`);
    await as(blocked).put(`/people/${giver}/block`);
    expect((await as(giver).get(`/groups/${conversationId}/gift`)).json()).toEqual({ enabled: false });
    expect((await as(giver).post(`/groups/${conversationId}/gift`, { amount: 10, idempotencyKey: 'group-gift-1' })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set group_gifts_enabled = true');
    expect((await as(giver).get(`/groups/${conversationId}/gift`)).json()).toEqual({ enabled: true, recipients: 2 });
    expect((await as(giver).post(`/groups/${conversationId}/gift`, { amount: 1, idempotencyKey: 'group-gift-0' })).statusCode).toBe(400);
    const r = await as(giver).post(`/groups/${conversationId}/gift`, { amount: 11, idempotencyKey: 'group-gift-1' });
    expect(r.json()).toMatchObject({ recipients: 2, each: 5, given: 10, balance: 30 });
    // A retry with the same key gives nothing twice.
    expect((await as(giver).post(`/groups/${conversationId}/gift`, { amount: 11, idempotencyKey: 'group-gift-1' })).json()).toMatchObject({ balance: 30 });
    expect(await tokens.balanceOf(db, a)).toBe(5);
    expect(await tokens.balanceOf(db, blocked)).toBe(0);
    const outsider = await createUser('Group Outsider');
    expect((await as(outsider).get(`/groups/${conversationId}/gift`)).statusCode).toBe(404);

    const event = (await as(a).post('/events', { title: 'Park prayer walk', description: 'Meet at the gate.', startsAt: inHours(24), location: 'City park' })).json();
    const eventId = event.event?.id ?? event.id;
    await as(b).put(`/events/${eventId}/rsvp`, { status: 'going' });
    const e = await as(giver).post(`/events/${eventId}/gift`, { amount: 4, idempotencyKey: 'event-gift-1' });
    expect(e.json()).toMatchObject({ recipients: 2, each: 2, balance: 26 });
  });
});
