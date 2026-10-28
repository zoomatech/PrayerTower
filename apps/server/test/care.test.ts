import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as care from '../src/modules/care/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await care.updateSettings(db, { careEnabled: true, confessionEnabled: false, maxOpenPerMember: 2 });
  await db.end();
});

describe('talk to a prayer partner or pastor', () => {
  it('routes a request to staff, who claim it into a private conversation', async () => {
    const member = await createUser('Lonely Member');
    const partner = await createUser('Prayer Partner Pat');
    const pastor = await createUser('Pastor Paul');
    const other = await createUser('Other Member');
    await grantRole(db, partner, 'prayer_partner', null);
    await grantRole(db, pastor, 'pastor_counselor', null);

    expect((await as(member).get('/care')).json()).toEqual({ enabled: true, kinds: ['pray_with_me', 'pastor'], confessionRetentionDays: 7 });
    expect((await as(member).post('/care-requests', { kind: 'confession', body: 'x' })).statusCode).toBe(403);

    const req1 = (await as(member).post('/care-requests', { kind: 'pray_with_me', body: 'I feel alone tonight. Would someone pray with me?' })).json();
    const req2 = (await as(member).post('/care-requests', { kind: 'pastor', body: 'I have a question about forgiveness.' })).json();
    expect((await as(member).post('/care-requests', { kind: 'pastor', body: 'third' })).statusCode).toBe(429);

    expect((await as(other).get('/care/queue')).statusCode).toBe(403);
    const partnerQueue = (await as(partner).get('/care/queue')).json().requests.map((r: { id: string }) => r.id);
    expect(partnerQueue).toContain(req1.id);
    expect(partnerQueue).not.toContain(req2.id); // pastors only
    expect((await as(pastor).get('/care/queue')).json().requests.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([req1.id, req2.id]));
    expect((await as(partner).get('/me/notifications')).json().notifications.some((n: { kind: string }) => n.kind === 'care_request')).toBe(true);

    const { conversationId } = (await as(partner).post(`/care-requests/${req1.id}/claim`)).json();
    expect((await as(pastor).post(`/care-requests/${req1.id}/claim`)).statusCode).toBe(409);
    expect((await as(pastor).get('/care/queue')).json().requests.map((r: { id: string }) => r.id)).not.toContain(req1.id);

    const view = (await as(member).get(`/conversations/${conversationId}`)).json();
    expect(view.conversation).toMatchObject({ kind: 'care', isRequest: false, title: 'Prayer Partner Pat' });
    expect(view.messages[0]).toMatchObject({ mine: true, body: 'I feel alone tonight. Would someone pray with me?' });
    expect((await as(partner).post(`/conversations/${conversationId}/messages`, { body: 'I am here. Let us pray together.' })).statusCode).toBe(201);
    expect((await as(member).post(`/conversations/${conversationId}/messages`, { body: 'Thank you.' })).statusCode).toBe(201);
    const notice = (await as(member).get('/me/notifications')).json().notifications.find((n: { title: string }) => n.title.includes('is here to pray with you'));
    expect(notice.data.conversationId).toBe(conversationId);

    expect((await as(member).get('/me/care-requests')).json().requests.find((r: { id: string }) => r.id === req1.id)).toMatchObject({ status: 'claimed', conversationId });
    expect((await as(other).post(`/care-requests/${req1.id}/close`)).statusCode).toBe(404);
    expect((await as(member).post(`/care-requests/${req1.id}/close`)).statusCode).toBe(200);
  });

  it('puts someone who may be in danger first and tells moderators', async () => {
    const member = await createUser('Danger Member');
    const partner = await createUser('Crisis Partner');
    const mod = await createUser('Crisis Mod');
    await grantRole(db, partner, 'prayer_partner', null);
    await grantRole(db, mod, 'moderator', null);
    const calm = (await as(member).post('/care-requests', { kind: 'pray_with_me', body: 'A hard day at work.' })).json();
    expect(calm.crisis).toBe(false);
    await care.updateSettings(db, { maxOpenPerMember: 5 });
    const r = (await as(member).post('/care-requests', { kind: 'pray_with_me', body: "I don't want to live anymore" })).json();
    expect(r.crisis).toBe(true);
    const queue = (await as(partner).get('/care/queue')).json().requests as { id: string; crisis: boolean }[];
    const at = (id: string) => queue.findIndex((x) => x.id === id);
    expect(at(r.id)).toBeLessThan(at(calm.id));
    expect(queue.slice(0, at(r.id)).every((x) => x.crisis)).toBe(true);
    const n = (await as(mod).get('/me/notifications')).json().notifications;
    expect(n.some((x: { title: string }) => x.title.startsWith('Someone may be in danger'))).toBe(true);
  });

  it('keeps confession off until an admin turns it on', async () => {
    const admin = await createUser('Care Admin');
    await grantRole(db, admin, 'admin', null);
    const r = await as(admin).patch('/admin/care-settings', { confessionEnabled: true });
    expect(r.json().settings.confession_enabled).toBe(true);
    expect((await as(admin).get('/care')).json().kinds).toContain('confession');
    await as(admin).patch('/admin/care-settings', { confessionEnabled: false, careEnabled: false });
    expect((await as(admin).get('/care')).json()).toMatchObject({ enabled: false, kinds: [] });
    await as(admin).patch('/admin/care-settings', { careEnabled: true });
  });
});
