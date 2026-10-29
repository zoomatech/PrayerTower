import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as packet from '../src/modules/radio/packet.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const packetDefault = await packet.enabled(db);
const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

let admin: string;
let member: string;
let nodeKey: string;
beforeAll(async () => {
  admin = await createUser('Packet Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Packet Member');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
  nodeKey = (await as(admin).post('/admin/radio-nodes', { name: `Packet listener ${RUN}` })).json().key;
});
afterAll(async () => {
  await packet.setEnabled(db, packetDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

describe('packet fallback', () => {
  it('is off by default: a packet station is refused and its prayers wait', async () => {
    expect(packetDefault).toBe(false);
    const post = await newRequest(member, `Packet request ${RUN}.`);
    await as(member).post(`/posts/${post.id}/radio`, { idempotencyKey: `packet-${RUN}` });
    const res = await station('/station/claim-batch', { max: 50, mode: 'packet' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('packet_off');
    expect((await app.inject({ method: 'POST', url: '/node/heard-ids', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, ids: ['abcdef'] } })).statusCode).toBe(404);
  });

  it('when on, sends by packet and a listener\'s short IDs mark the prayer heard', async () => {
    expect((await as(admin).patch('/admin/radio-packet', { enabled: true })).json()).toEqual({ enabled: true });
    const batch = (await station('/station/claim-batch', { max: 50, mode: 'packet' })).json().radioPrayers as { id: string; text: string }[];
    const mine = batch.find((p) => p.text === `Packet request ${RUN}.`)!;
    expect(mine).toBeTruthy();
    for (const p of batch) await station(`/station/radio-prayers/${p.id}/result`, { ok: true, callSign: CALL, preset: 'aprs-1200', sentHash: fingerprint(p.text), pieces: 1 });
    const id = fingerprint(mine.text).slice(0, 6);
    // Another call sign's report, or an unknown ID, matches nothing.
    expect((await app.inject({ method: 'POST', url: '/node/heard-ids', headers: { 'x-node-key': nodeKey }, payload: { callSign: 'N0OTHER', ids: [id] } })).json()).toEqual({ matched: 0 });
    expect((await app.inject({ method: 'POST', url: '/node/heard-ids', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, ids: ['zzzzzz'] } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/node/heard-ids', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, ids: [id] } })).json()).toEqual({ matched: 1 });
    const { rows } = await db.query<{ heard_at: Date | null; preset: string }>('select heard_at, preset from public.radio_prayers where id = $1', [mine.id]);
    expect(rows[0]!.preset).toBe('aprs-1200');
    expect(rows[0]!.heard_at).not.toBeNull();
  });
});
