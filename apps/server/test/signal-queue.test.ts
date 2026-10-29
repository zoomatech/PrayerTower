import { createHash } from 'node:crypto';
import { signalCode, SIGNAL_CHARS } from '@prayer-tower/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as signalQueue from '../src/modules/radio/signal-queue.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const defaultOn = await signalQueue.enabled(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

let admin: string;
let sender: string;
beforeAll(async () => {
  admin = await createUser('Signal Admin');
  await grantRole(db, admin, 'admin', null);
  sender = await createUser('Signal Sender');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await signalQueue.setEnabled(db, defaultOn);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

describe('signal codes', () => {
  it('turn a fingerprint into 12 unambiguous letters, the same every time', () => {
    const code = signalCode(fingerprint('Pray for the valley clinic.'))!;
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code.replace(/-/g, '').split('').every((c) => SIGNAL_CHARS.includes(c))).toBe(true);
    expect(signalCode(fingerprint('Pray for the valley clinic.'))).toBe(code);
    expect(signalCode(fingerprint('Pray for the valley clinic!'))).not.toBe(code);
    expect(signalCode('0'.repeat(32))).toBe('AAAA-AAAA-AAAA');
    expect(signalCode('nope')).toBeNull();
  });
});

describe('my signal queue', () => {
  it('is off by default', async () => {
    expect(defaultOn).toBe(false);
    expect((await as(sender).get('/me/signal-queue')).statusCode).toBe(404);
    expect((await as(sender).patch('/admin/signal-queue', { enabled: true })).statusCode).toBe(403);
  });

  it("lists the member's own radio prayers with status, and the code of what went out", async () => {
    expect((await as(admin).patch('/admin/signal-queue', { enabled: true })).json()).toEqual({ enabled: true });
    const a = await newRequest(await createUser('Signal Poster'), `Pray for the night ferry. ${RUN}`);
    const b = await newRequest(await createUser('Signal Poster 2'), `Pray for the bakery fire. ${RUN}`);
    await as(sender).post(`/posts/${a.id}/radio`, { idempotencyKey: `sig-a-${RUN}` });
    let [first] = (await as(sender).get('/me/signal-queue')).json().signals;
    expect(first).toMatchObject({ postId: a.id, status: 'waiting', signalCode: null, amplified: false });
    const [p] = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
    await station(`/station/radio-prayers/${p!.id}/result`, { ok: true, callSign: 'N0SIG', preset: 'fm-standard', sentHash: fingerprint(p!.text) });
    await as(sender).post(`/posts/${b.id}/radio`, { idempotencyKey: `sig-b-${RUN}` });
    const list = (await as(sender).get('/me/signal-queue')).json().signals;
    expect(list.map((s: { postId: string }) => s.postId)).toEqual([b.id, a.id]);
    first = list[1];
    expect(first).toMatchObject({ status: 'sent', callSign: 'N0SIG', preset: 'fm-standard', signalCode: signalCode(fingerprint(p!.text)) });
    expect((await as(admin).get('/me/signal-queue')).json().signals).toEqual([]);
    expect((await as(sender).get('/features')).json().features.signalQueue).toBe(true);
  });
});
