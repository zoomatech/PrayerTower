import { createHash } from 'node:crypto';
import { JOURNEY_LANDMARKS, LIGHT_KM_S, signalCode, signalJourney, SIGNAL_CHARS } from '@prayer-tower/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as signalQueue from '../src/modules/radio/signal-queue.js';
import * as trail from '../src/modules/radio/trail.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const defaultOn = await signalQueue.enabled(db);
const journeyDefault = await signalQueue.journeyEnabled(db);
const trailDefault = await trail.enabled(db);
const { rows: receiptRows } = await db.query<{ on: boolean }>('select radio_receipts_enabled as on from public.token_settings');
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
  await signalQueue.setJourneyEnabled(db, journeyDefault);
  await trail.setEnabled(db, trailDefault);
  await db.query('update public.token_settings set radio_receipts_enabled = $1', [receiptRows[0]!.on]);
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

describe('signal journey', () => {
  it('measures how far a wave has gone, in light units, with the landmarks it passed', () => {
    const t0 = Date.UTC(2026, 9, 30);
    expect(signalJourney(t0, t0 - 5000)).toMatchObject({ seconds: 0, km: 0, passed: [], next: { key: 'moon' } });
    const one = signalJourney(t0, t0 + 1000);
    expect(one.km).toBeCloseTo(LIGHT_KM_S, 3);
    expect(one.light).toEqual({ value: 1, unit: 'second' });
    expect(one.next?.key).toBe('moon');
    expect(one.next!.inSeconds).toBeCloseTo(384_400 / LIGHT_KM_S - 1, 3);
    // The Moon is about 1.28 light-seconds away and the Sun about 8.3 light-minutes.
    expect(signalJourney(t0, t0 + 1300).passed).toEqual(['moon']);
    const tenMin = signalJourney(t0, t0 + 10 * 60_000);
    expect(tenMin.light).toEqual({ value: 10, unit: 'minute' });
    expect(tenMin.passed).toEqual(['moon', 'sun']);
    expect(tenMin.next?.key).toBe('neptune');
    expect(tenMin.next!.fraction).toBeGreaterThan(0);
    expect(tenMin.next!.fraction).toBeLessThan(1);
    const day = signalJourney(t0, t0 + 86_400_000);
    expect(day.light).toEqual({ value: 1, unit: 'day' });
    expect(day.passed).toEqual(['moon', 'sun', 'neptune', 'heliopause', 'voyager']);
    const far = signalJourney(t0, t0 + 5 * 365.25 * 86_400_000);
    expect(far.light).toEqual({ value: 5, unit: 'year' });
    expect(far.passed).toHaveLength(JOURNEY_LANDMARKS.length);
    expect(far.next).toBeNull();
  });

  it('lists landmarks nearest first', () => {
    const kms = JOURNEY_LANDMARKS.map((l) => l.km);
    expect([...kms].sort((a, b) => a - b)).toEqual(kms);
  });

  it('is off by default; turned on, the queue says so and carries copies and the strongest report', async () => {
    expect(journeyDefault).toBe(false);
    await signalQueue.setEnabled(db, true);
    expect((await as(sender).get('/me/signal-queue')).json().journey).toBe(false);
    expect((await as(sender).get('/features')).json().features.signalJourney).toBe(false);
    expect((await as(sender).patch('/admin/signal-journey', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/signal-journey', { enabled: true })).json()).toEqual({ enabled: true });
    expect((await as(admin).get('/admin/signal-journey')).json()).toEqual({ enabled: true });

    const post = await newRequest(await createUser('Journey Poster'), `Pray for the river crossing. ${RUN}`);
    await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: `journey-${RUN}` });
    // The earlier test leaves one waiting; the station sends both.
    const claimed = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
    for (const c of claimed) await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: 'N0JRN', preset: 'fm-standard', sentHash: fingerprint(c.text) });
    const p = claimed.find((c) => c.text.includes('river crossing'));
    let r = (await as(sender).get('/me/signal-queue')).json();
    expect(r.journey).toBe(true);
    expect(r.signals[0]).toMatchObject({ postId: post.id, status: 'sent', copies: 1, bestSnrDb: null });

    // Reports are kept per receiver only while "Where it was heard" is on (radio/trail.ts).
    await trail.setEnabled(db, true);
    await db.query('update public.token_settings set radio_receipts_enabled = true');
    const node = (await as(admin).post('/admin/radio-nodes', { name: `Journey ear ${RUN}` })).json().key as string;
    const node2 = (await as(admin).post('/admin/radio-nodes', { name: `Journey ear 2 ${RUN}` })).json().key as string;
    for (const [key, snrDb] of [[node, 7.25], [node2, 14.04]] as const) {
      const h = await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': key }, payload: { callSign: 'N0JRN', preset: 'fm-standard', snrDb, hashes: [fingerprint(p!.text)] } });
      expect(h.json()).toEqual({ matched: 1 });
    }
    r = (await as(sender).get('/me/signal-queue')).json();
    expect(r.signals[0].bestSnrDb).toBe(14);
    expect((await as(sender).get('/features')).json().features.signalJourney).toBe(true);
  });
});
