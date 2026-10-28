import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(async () => {
  await db.query('update public.spoken_prayer_settings set enabled = false, max_seconds = 60, max_offer_tokens = 10');
  await db.end();
});

describe('spoken prayers', () => {
  it('stay off until an admin turns them on', async () => {
    const admin = await createUser('Spoken Admin');
    await grantRole(db, admin, 'admin', null);
    const asker = await createUser('Spoken Asker');
    const { id } = await newRequest(asker);
    expect((await as(asker).get(`/posts/${id}/spoken-prayers`)).json()).toEqual({ enabled: false });
    expect((await as(asker).put(`/posts/${id}/spoken-prayers/invite`, { offerTokens: 0 })).statusCode).toBe(404);
    expect((await as(asker).patch('/admin/spoken-prayers', { enabled: true })).statusCode).toBe(403);
    const on = await as(admin).patch('/admin/spoken-prayers', { enabled: true, maxSeconds: 90, maxOfferTokens: 5 });
    expect(on.json().settings).toEqual({ enabled: true, max_seconds: 90, max_offer_tokens: 5 });
  });

  it('are sent only after praying, on requests that asked for them, once each, and pay the offer when heard', async () => {
    await db.query('update public.spoken_prayer_settings set enabled = true, max_seconds = 60, max_offer_tokens = 5');
    const asker = await createUser('Hannah Asker');
    const prayer = await createUser('Eli Prayer');
    const { id } = await newRequest(asker);
    const send = (who: string, extra: object = {}) =>
      as(who).post(`/posts/${id}/spoken-prayers`, { storagePath: `${who}/a.m4a`, durationSeconds: 30, ...extra });

    expect((await send(prayer)).statusCode).toBe(403); // not asked for yet
    expect((await as(prayer).put(`/posts/${id}/spoken-prayers/invite`, { offerTokens: 1 })).statusCode).toBe(404); // not their request
    expect((await as(asker).put(`/posts/${id}/spoken-prayers/invite`, { offerTokens: 6 })).statusCode).toBe(400); // over the cap
    expect((await as(asker).put(`/posts/${id}/spoken-prayers/invite`, { offerTokens: 2 })).json()).toEqual({ invited: true, offerTokens: 2 });

    expect((await send(prayer)).statusCode).toBe(403); // must pray first
    await as(prayer).post(`/posts/${id}/praying-now`, {});
    expect((await as(prayer).get(`/posts/${id}/spoken-prayers`)).json()).toMatchObject({ invited: true, offerTokens: 2, prayed: true, sent: false });
    expect((await send(prayer, { storagePath: `${asker}/x.m4a` })).statusCode).toBe(400); // someone else's file
    expect((await send(prayer, { durationSeconds: 61 })).statusCode).toBe(400);
    expect((await send(asker)).statusCode).toBe(400); // own request
    const made = await send(prayer);
    expect(made.statusCode, made.body).toBe(201);
    expect((await send(prayer)).statusCode).toBe(409);
    await drainJobs();
    const { rows: notes } = await db.query(`select title from public.notifications where user_id = $1 and kind = 'spoken_prayer'`, [asker]);
    expect(notes[0]?.title).toBe('Eli Prayer recorded a prayer for you');

    const list = (await as(asker).get(`/posts/${id}/spoken-prayers`)).json();
    expect(list).toMatchObject({ mine: true, invited: true, offerTokens: 2 });
    expect(list.received).toEqual([expect.objectContaining({ id: made.json().id, from: { id: prayer, displayName: 'Eli Prayer' }, durationSeconds: 30, paid: false, listened: false })]);

    // Not enough tokens: heard, but unpaid; with tokens, paid exactly once.
    const spokenId = made.json().id;
    expect((await as(asker).post(`/spoken-prayers/${spokenId}/listened`)).json()).toEqual({ listened: true, paid: false, notEnoughTokens: true });
    await tokens.earn(db, asker, 5, `t:${asker}:seed`, 'test');
    const before = await tokens.balanceOf(db, prayer);
    expect((await as(asker).post(`/spoken-prayers/${spokenId}/listened`)).json()).toEqual({ listened: true, paid: true, notEnoughTokens: false });
    expect((await as(asker).post(`/spoken-prayers/${spokenId}/listened`)).json()).toMatchObject({ paid: true });
    expect((await tokens.balanceOf(db, prayer)) - before).toBe(2);
    expect(await tokens.balanceOf(db, asker)).toBe(3);
    expect((await as(prayer).post(`/spoken-prayers/${spokenId}/listened`)).statusCode).toBe(404);
  });

  it('can be reported only by the two people involved, and removed by either', async () => {
    await db.query('update public.spoken_prayer_settings set enabled = true');
    const asker = await createUser('Report Asker');
    const sender = await createUser('Report Sender');
    const stranger = await createUser('Report Stranger');
    const { id } = await newRequest(asker);
    await as(asker).put(`/posts/${id}/spoken-prayers/invite`, {});
    await as(sender).post(`/posts/${id}/praying-now`, {});
    const spokenId = (await as(sender).post(`/posts/${id}/spoken-prayers`, { storagePath: `${sender}/b.m4a`, durationSeconds: 12 })).json().id;

    const report = (who: string) => as(who).post('/reports', { targetType: 'spoken_prayer', targetId: spokenId, reason: 'Not a prayer' });
    expect((await report(stranger)).statusCode).toBe(404);
    expect((await report(asker)).statusCode).toBe(201);
    const mod = await createUser('Spoken Mod');
    await grantRole(db, mod, 'moderator', null);
    const queue = (await as(mod).get(`/moderation/queue?targetId=${spokenId}`)).json().items;
    expect(queue[0]).toMatchObject({ target_type: 'spoken_prayer', content: '[Spoken prayer, 12 seconds of audio]' });
    expect((await as(mod).get(`/moderation/spoken-prayers/${spokenId}/audio`)).json()).toEqual({ url: null });
    expect((await as(asker).get(`/moderation/spoken-prayers/${spokenId}/audio`)).statusCode).toBe(403);

    expect((await as(stranger).delete(`/spoken-prayers/${spokenId}`)).statusCode).toBe(404);
    expect((await as(asker).delete(`/spoken-prayers/${spokenId}`)).json()).toEqual({ removed: true });
    expect((await as(asker).get(`/posts/${id}/spoken-prayers`)).json().received).toEqual([]);
  });
});
