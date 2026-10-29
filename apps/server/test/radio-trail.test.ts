import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as trail from '../src/modules/radio/trail.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const trailDefault = await trail.enabled(db);
const { rows: receiptRows } = await db.query<{ on: boolean }>('select radio_receipts_enabled as on from public.token_settings');
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const node = (url: string, key: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-node-key': key }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `W${RUN}`;

let admin: string;
let sender: string;
let poster: string;
let stranger: string;
beforeAll(async () => {
  admin = await createUser('Trail Admin');
  await grantRole(db, admin, 'admin', null);
  sender = await createUser('Trail Sender');
  poster = await createUser('Trail Poster');
  stranger = await createUser('Trail Stranger');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await db.query('update public.token_settings set radio_receipts_enabled = true');
});
afterAll(async () => {
  await trail.setEnabled(db, trailDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query('update public.token_settings set radio_receipts_enabled = $1', [receiptRows[0]!.on]);
  await db.end();
});

async function sendOne(text: string) {
  const post = await newRequest(poster, text);
  await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: `trail-${RUN}-${text.length}` });
  const [p] = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
  await station(`/station/radio-prayers/${p!.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p!.text) });
  return { post, hash: fingerprint(p!.text) };
}

describe('where it was heard', () => {
  it('is off by default: nothing kept, no trail', async () => {
    expect(trailDefault).toBe(false);
    const { post, hash } = await sendOne(`Pray for the harbour town. ${RUN}`);
    await app.inject({ method: 'POST', url: '/listen/heard', payload: { callSign: CALL, preset: 'fm-standard', snrDb: 9, hashes: [hash] } });
    expect((await as(sender).get(`/posts/${post.id}/radio-trail`)).statusCode).toBe(404);
    expect((await as(admin).patch('/admin/heard-trail', { enabled: true })).statusCode).toBe(200);
    expect((await as(sender).get(`/posts/${post.id}/radio-trail`)).json().trail[0]).toMatchObject({ callSign: CALL, nodes: [], phones: 0 });
  });

  it('names each listener node with its best signal, counts phones, and shows it only to the sender and the asker', async () => {
    expect((await as(sender).patch('/admin/heard-trail', { enabled: false })).statusCode).toBe(403);
    const { post, hash } = await sendOne(`Pray for the ferry crossing tonight, all of it. ${RUN}`);
    const hill = (await as(admin).post('/admin/radio-nodes', { name: 'Hilltop' })).json();
    await node('/node/heard', hill.key, { callSign: CALL, preset: 'fm-standard', snrDb: 11.24, hashes: [hash] });
    await node('/node/heard', hill.key, { callSign: CALL, preset: 'fm-standard', snrDb: 17.86, hashes: [hash] });
    await app.inject({ method: 'POST', url: '/listen/heard', payload: { callSign: CALL, preset: 'fm-standard', snrDb: 6, hashes: [hash] } });
    await app.inject({ method: 'POST', url: '/listen/heard', payload: { callSign: CALL, preset: 'fm-standard', snrDb: 4, hashes: [hash] } });
    const [t] = (await as(sender).get(`/posts/${post.id}/radio-trail`)).json().trail;
    expect(t).toMatchObject({ callSign: CALL, amplified: false, phones: 2, nodes: [{ name: 'Hilltop', snrDb: 17.9 }] });
    expect((await as(poster).get(`/posts/${post.id}/radio-trail`)).json().trail).toHaveLength(1);
    expect((await as(stranger).get(`/posts/${post.id}/radio-trail`)).json().trail).toEqual([]);
    expect((await as(sender).get('/features')).json().features.heardTrail).toBe(true);
  });
});
