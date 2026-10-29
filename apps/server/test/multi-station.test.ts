import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const multiDefault = await nodes.multiStation(db);
const station = (path: string, key: string, body: object = {}) => app.inject({ method: 'POST', url: path, headers: { 'x-station-key': key }, payload: body });
type Claimed = { id: string; text: string };

let admin: string;
beforeAll(async () => {
  admin = await createUser('Multi Admin');
  await grantRole(db, admin, 'admin', null);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query(`delete from public.radio_nodes`);
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await nodes.setMultiStation(db, multiDefault);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query(`delete from public.radio_nodes`);
  await db.end();
});

describe('several stations sharing one queue', () => {
  it('is off by default: a second station key is refused until an admin turns it on', async () => {
    expect(multiDefault).toBe(false);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    const { key } = (await as(admin).post('/admin/radio-nodes', { name: 'Valley station', role: 'station' })).json();
    expect((await station('/station/claim-batch', key, { max: 5 })).statusCode).toBe(401);
    expect((await as(admin).patch('/admin/radio-nodes', { multiStation: true })).json()).toEqual({ enabled: false, multiStation: true, signaturesRequired: false });
    expect((await station('/station/claim-batch', key, { max: 5 })).statusCode).toBe(204);
    // A listener's key is not a station key.
    const listener = (await as(admin).post('/admin/radio-nodes', { name: 'Listener only' })).json();
    expect((await station('/station/claim', listener.key)).statusCode).toBe(401);
  });

  it('never hands the same prayer to two stations, even when they ask at the same moment', async () => {
    const b = (await as(admin).post('/admin/radio-nodes', { name: 'Hill station', role: 'station' })).json();
    const c = (await as(admin).post('/admin/radio-nodes', { name: 'Town station', role: 'station' })).json();
    const posters = [await createUser('Shared Queue Poster A'), await createUser('Shared Queue Poster B')];
    const sender = await createUser('Shared Queue Sender');
    for (let i = 0; i < 12; i++) {
      // Two posters: a member may post 10 requests an hour.
      const p = await newRequest(posters[i % 2]!, `Shared queue prayer ${i}.`);
      await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `multi-${i}` });
    }
    const asks = await Promise.all([STATION_KEY, b.key, c.key, b.key, c.key, STATION_KEY].map((k) => station('/station/claim-batch', k, { max: 3 })));
    const got = asks.map((r) => (r.statusCode === 200 ? (r.json().radioPrayers as Claimed[]) : []));
    const ids = got.flat().map((p) => p.id);
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);

    // Each claim records its station; only that station can report it.
    const fromB = got[1]![0]!;
    expect((await station(`/station/radio-prayers/${fromB.id}/result`, c.key, { ok: true, callSign: 'W1AW' })).statusCode).toBe(400);
    expect((await station(`/station/radio-prayers/${fromB.id}/result`, STATION_KEY, { ok: true, callSign: 'N0CALL' })).statusCode).toBe(400);
    expect((await station(`/station/radio-prayers/${fromB.id}/result`, b.key, { ok: true, callSign: 'K1ABC' })).statusCode).toBe(200);
    const fromMain = got[0]![0]!;
    expect((await station(`/station/radio-prayers/${fromMain.id}/result`, b.key, { ok: true, callSign: 'K1ABC' })).statusCode).toBe(400);
    expect((await station(`/station/radio-prayers/${fromMain.id}/result`, STATION_KEY, { ok: true, callSign: 'N0CALL' })).statusCode).toBe(200);

    const view = (await as(admin).get('/admin/radio-nodes')).json();
    expect(view.multiStation).toBe(true);
    const hill = view.stations.find((s: { node: string | null }) => s.node === 'Hill station');
    expect(hill).toMatchObject({ sent: 1 });
    // The main station (no node) has other tests' prayers too.
    expect(view.stations.find((s: { node: string | null }) => s.node === null).sent).toBeGreaterThanOrEqual(1);

    // A claim left too long goes back to the queue for any station, and the late station's report is refused.
    const stale = got[2]![0]!;
    await db.query(`update public.radio_prayers set claimed_at = now() - interval '1 hour' where id = $1`, [stale.id]);
    const again = (await station('/station/claim-batch', b.key, { max: 1 })).json().radioPrayers as Claimed[];
    expect(again.map((p) => p.id)).toEqual([stale.id]);
    expect((await station(`/station/radio-prayers/${stale.id}/result`, c.key, { ok: true, callSign: 'W1AW' })).statusCode).toBe(400);
    expect((await station(`/station/radio-prayers/${stale.id}/result`, b.key, { ok: true, callSign: 'K1ABC' })).statusCode).toBe(200);

    // Turning several stations off stops the extra keys; the main station keeps working.
    await as(admin).patch('/admin/radio-nodes', { multiStation: false });
    expect((await station('/station/claim-batch', b.key, { max: 1 })).statusCode).toBe(401);
    expect([200, 204]).toContain((await station('/station/claim-batch', STATION_KEY, { max: 1 })).statusCode);
  });
});
