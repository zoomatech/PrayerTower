// "Praying for you now" Live Activity: the author's own open request on their Lock Screen,
// updated through Apple push as people pray. First names only, never the words.
import { generateKeyPairSync, verify } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as growth from '../src/modules/growth/index.js';
import { providerToken, type ApnsSend } from '../src/modules/live-activity/apns.js';
import * as live from '../src/modules/live-activity/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

let admin: string;
const token = (n: number) => n.toString(16).padStart(64, 'a');
const sent: { token: string; topic: string; payload: { aps: { event: string; 'content-state': { name: string; props: string } } }; headers: Record<string, string> }[] = [];
let status = 200;
let reason: string | null = null;
const send: ApnsSend = async (t, topic, payload, headers) => {
  sent.push({ token: t, topic, payload: payload as never, headers });
  return { status, reason };
};

beforeEach(async () => {
  sent.length = 0;
  status = 200;
  reason = null;
  admin ??= await createUser('Live Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/growth-settings', { prayedForLiveEnabled: true });
});

afterAll(async () => {
  await growth.updateSettings(db, { prayedForLiveEnabled: false });
  await db.query('delete from public.live_activities');
  await db.end();
});

const start = (user: string, postId: string, n: number) => as(user).post('/me/live-activities', { postId, pushToken: token(n), appId: 'com.zoomatech.prayertower' });

describe('prayed-for Live Activity', () => {
  it('is off by default and only for the author’s own open request', async () => {
    await as(admin).patch('/admin/growth-settings', { prayedForLiveEnabled: false });
    const author = await createUser('Live Off');
    const post = await newRequest(author);
    expect((await as(author).get('/features')).json().features.prayedForLive).toBe(false);
    expect((await start(author, post.id, 1)).statusCode).toBe(403);
    await as(admin).patch('/admin/growth-settings', { prayedForLiveEnabled: true });
    const other = await createUser('Live Stranger');
    expect((await start(other, post.id, 2)).statusCode).toBe(403);
    const r = await start(author, post.id, 3);
    expect(r.statusCode).toBe(201);
    expect(r.json().props).toEqual({ heading: 'Praying for you', line: 'Waiting for the first prayer', count: 0 });
  });

  it('pushes an update with first names when people pray, never the anonymous ones', async () => {
    const author = await createUser('Live Author');
    const ana = await createUser('Ana Maria Lopez');
    const shy = await createUser('Shy Pray-er');
    const post = await newRequest(author, 'Please pray, very private details here.');
    await start(author, post.id, 10);
    await live.refresh(db, send);
    expect(sent).toHaveLength(0);

    await as(ana).post(`/posts/${post.id}/praying-now`, {});
    await live.refresh(db, send);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.topic).toBe('com.zoomatech.prayertower.push-type.liveactivity');
    expect(sent[0]!.headers['apns-push-type']).toBe('liveactivity');
    expect(sent[0]!.payload.aps.event).toBe('update');
    expect(sent[0]!.payload.aps['content-state'].name).toBe('PrayedFor');
    expect(JSON.parse(sent[0]!.payload.aps['content-state'].props)).toEqual({ heading: 'Praying for you', line: 'Ana prayed for you', count: 1 });

    await as(shy).post(`/posts/${post.id}/praying-now`, { isAnonymous: true });
    await live.refresh(db, send);
    const props = JSON.parse(sent[1]!.payload.aps['content-state'].props);
    expect(props).toEqual({ heading: 'Praying for you', line: 'Ana and 1 other prayed for you', count: 2 });
    expect(JSON.stringify(sent)).not.toContain('private details');
    expect(JSON.stringify(sent)).not.toContain('Shy');
    // Nothing new: nothing sent.
    await live.refresh(db, send);
    expect(sent).toHaveLength(2);
  });

  it('ends after 8 hours, when answered, or when Apple says the token is gone', async () => {
    const author = await createUser('Live Ender');
    const post = await newRequest(author);
    await start(author, post.id, 20);
    await live.refresh(db, send, new Date(Date.now() + 9 * 3600_000));
    expect(sent.filter((s) => s.token === token(20)).map((s) => s.payload.aps.event)).toEqual(['end']);
    const { rows } = await db.query('select ended_at from public.live_activities where push_token = $1', [token(20)]);
    expect(rows[0].ended_at).not.toBeNull();

    const post2 = await newRequest(author, 'A second request to follow live.');
    await start(author, post2.id, 21);
    const ana = await createUser('Gone Token Ana');
    await as(ana).post(`/posts/${post2.id}/praying-now`, {});
    status = 410;
    reason = 'Unregistered';
    await live.refresh(db, send);
    const { rows: gone } = await db.query('select ended_at from public.live_activities where push_token = $1', [token(21)]);
    expect(gone[0].ended_at).not.toBeNull();
  });

  it('keeps at most three open and one per request, and the member can end one', async () => {
    const author = await createUser('Live Many');
    const p1 = await newRequest(author);
    await start(author, p1.id, 30);
    await start(author, p1.id, 31);
    const open = async () => (await db.query('select push_token from public.live_activities where user_id = $1 and ended_at is null order by created_at', [author])).rows.map((r) => r.push_token);
    expect(await open()).toEqual([token(31)]);
    for (const n of [32, 33, 34]) await start(author, (await newRequest(author, `Request number ${n} for the Lock Screen.`)).id, n);
    expect(await open()).toEqual([token(32), token(33), token(34)]);
    await as(author).post('/me/live-activities/end', { pushToken: token(34) });
    expect(await open()).toEqual([token(32), token(33)]);
  });

  it('uses Open Circle wording', () => {
    expect(live.props({ people: 2, names: ['Sam', 'Lee'] }, true)).toEqual({ heading: 'Thinking of you', line: 'Sam and Lee sent support', count: 2 });
  });

  it('signs Apple provider tokens with ES256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwt = providerToken({ keyId: 'ABC123DEFG', teamId: 'TEAM123456', privateKey: '', production: false }, privateKey, 1_700_000_000_000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(JSON.parse(Buffer.from(c!, 'base64url').toString())).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 });
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'))).toBe(true);
  });
});
