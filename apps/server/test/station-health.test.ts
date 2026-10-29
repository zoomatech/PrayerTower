import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as acks from '../src/modules/radio/acks.js';
import * as health from '../src/modules/radio/health.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const ackDefaults = await acks.settings(db);
const pageDefault = await health.pageEnabled(db);
const listenerDefault = await nodes.enabled(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const node = (url: string, key: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-node-key': key }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
type Claimed = { id: string; text: string };
// A call sign and texts of this run only, so the test can run again on the same database.
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

let admin: string;
let sender: string;
let poster: string;
beforeAll(async () => {
  admin = await createUser('Health Admin');
  await grantRole(db, admin, 'admin', null);
  sender = await createUser('Health Sender');
  poster = await createUser('Health Poster');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query(`update public.radio_prayers set heard_retries = 10 where status = 'transmitted' and heard_at is null`);
  await db.query(`delete from public.radio_nodes`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await acks.updateSettings(db, ackDefaults);
  await health.setPageEnabled(db, pageDefault);
  await nodes.setEnabled(db, listenerDefault);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query(`delete from public.radio_nodes`);
  await db.end();
});

let n = 0;
async function queuePrayer(text: string) {
  const p = await newRequest(poster, text);
  await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `health-${n++}` });
}
async function claimAll(): Promise<Claimed[]> {
  const res = await station('/station/claim-batch', { max: 50 });
  return res.statusCode === 200 ? res.json().radioPrayers : [];
}
const sent = (p: Claimed) => station(`/station/radio-prayers/${p.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p.text) });
const age = (id: string, minutes: number) => db.query(`update public.radio_prayers set transmitted_at = now() - make_interval(mins => $2) where id = $1`, [id, minutes]);

describe('station health page', () => {
  it('is off by default, and then shows each station, the queue, SNR per preset and failures', async () => {
    expect(pageDefault).toBe(false);
    expect((await as(admin).get('/admin/radio-health')).json().health).toBeNull();

    await station('/station/status', { callSign: CALL.toLowerCase(), checks: [{ name: 'audio', ok: true, detail: 'card 1' }, { name: 'rig', ok: false, detail: 'PTT did not key' }] });
    await station('/station/bursts', { callSign: CALL, mode: 'simulate', preset: 'fm-standard', prayers: 12, frames: 1, bytes: 300, seconds: 1.8, ok: true });
    await station('/station/bursts', { callSign: CALL, mode: 'audio', preset: 'fm-fast', prayers: 3, frames: 1, bytes: 90, seconds: 0.9, ok: false, error: 'aplay exited 1' });
    await nodes.setEnabled(db, true);
    const listener = (await as(admin).post('/admin/radio-nodes', { name: 'Health listener' })).json();
    for (const snrDb of [14, 18]) await node('/node/channel-report', listener.key, { callSign: CALL, preset: 'fm-standard', snrDb });
    await queuePrayer(`Health page queued prayer. ${RUN}`);

    const view = (await as(admin).patch('/admin/radio-health', { enabled: true })).json();
    expect(view.enabled).toBe(true);
    const st = view.health.stations.find((s: { callSign: string }) => s.callSign === CALL);
    expect(st).toMatchObject({ silent: false, bursts24h: 2, failed24h: 1, prayers24h: 15, lastError: 'aplay exited 1' });
    expect(st.checks).toContainEqual({ name: 'rig', ok: false, detail: 'PTT did not key' });
    expect(view.health.queue.queued).toBeGreaterThanOrEqual(1);
    expect(view.health.snr).toContainEqual(expect.objectContaining({ callSign: CALL, preset: 'fm-standard', reports: 2, avgDb: 16, minDb: 14 }));
    expect(view.health.failures[0]).toMatchObject({ kind: 'burst', callSign: CALL, error: 'aplay exited 1' });

    // A station that stopped checking in shows as silent.
    await db.query(`update public.station_status set reported_at = now() - interval '1 hour' where call_sign = $1`, [CALL]);
    const later = (await as(admin).get('/admin/radio-health')).json();
    expect(later.health.stations.find((s: { callSign: string }) => s.callSign === CALL).silent).toBe(true);
    await claimAll().then((ps) => Promise.all(ps.map(sent)));
  });

  it('only admins see it', async () => {
    expect((await as(sender).get('/admin/radio-health')).statusCode).toBe(403);
  });
});

describe('listener acknowledgements', () => {
  it('are off by default: an unheard prayer is never sent again', async () => {
    expect(ackDefaults).toEqual({ enabled: false, timeoutMinutes: 10, maxRetries: 2 });
    await queuePrayer(`Ack off prayer. ${RUN}`);
    const [p] = await claimAll();
    await sent(p!);
    await age(p!.id, 60);
    expect(await claimAll()).toEqual([]);
    // Keep it out of the next test (it would be resent once acknowledgements are on).
    await db.query('update public.radio_prayers set heard_retries = 10 where id = $1', [p!.id]);
  });

  it('send a prayer again until a listener decodes it, at most maxRetries times, while a listener is running', async () => {
    const view = (await as(admin).patch('/admin/radio-health', { acks: { enabled: true, timeoutMinutes: 5, maxRetries: 1 } })).json();
    expect(view.acks).toMatchObject({ enabled: true, timeoutMinutes: 5, maxRetries: 1 });
    const listener = (await as(admin).post('/admin/radio-nodes', { name: 'Ack listener' })).json();
    expect((await node('/node/heartbeat', listener.key)).statusCode).toBe(200);
    expect((await node('/node/heartbeat', 'ptn_wrong')).statusCode).toBe(401);

    await queuePrayer(`Nobody hears this prayer. ${RUN}`);
    await queuePrayer(`A listener hears this prayer. ${RUN}`);
    const first = await claimAll();
    expect(first).toHaveLength(2);
    for (const p of first) await sent(p);
    const [lost, heard] = first as [Claimed, Claimed];

    // The listener decodes one of them: that one counts as heard and is never resent.
    const ack = await node('/node/heard', listener.key, { callSign: CALL, preset: 'fm-standard', snrDb: 12, hashes: [fingerprint(heard.text)] });
    expect(ack.json()).toEqual({ matched: 1 });
    // Not before the timeout.
    expect(await claimAll()).toEqual([]);
    await age(lost.id, 6);
    await age(heard.id, 6);
    const again = await claimAll();
    expect(again.map((p) => p.id)).toEqual([lost.id]);
    await sent(again[0]!);

    // Out of retries: it stays sent but unheard.
    await age(lost.id, 6);
    expect(await claimAll()).toEqual([]);
    const { rows } = await db.query<{ heard_retries: number; status: string; heard_at: Date | null }>(
      'select heard_retries, status, heard_at from public.radio_prayers where id = $1',
      [lost.id],
    );
    expect(rows[0]).toMatchObject({ heard_retries: 1, status: 'transmitted', heard_at: null });
    const stats = (await as(admin).get('/admin/radio-health')).json().acks;
    expect(stats.heard).toBeGreaterThanOrEqual(1);
    expect(stats.unheard).toBeGreaterThanOrEqual(1);
    expect(stats.retried).toBeGreaterThanOrEqual(1);
  });

  it('do not resend while no listener has checked in recently', async () => {
    await db.query(`update public.radio_nodes set last_seen_at = now() - interval '1 hour'`);
    await queuePrayer(`Listener is off prayer. ${RUN}`);
    const [p] = await claimAll();
    await sent(p!);
    await age(p!.id, 60);
    expect(await claimAll()).toEqual([]);
  });

  it('a listener node key is needed to acknowledge, and the route is closed while every switch is off', async () => {
    expect((await node('/node/heard', 'ptn_wrong', { callSign: CALL, preset: 'fm-standard', snrDb: 12, hashes: ['0'.repeat(32)] })).statusCode).toBe(401);
    const listener = (await as(admin).post('/admin/radio-nodes', { name: 'Closed listener' })).json();
    await acks.updateSettings(db, { enabled: false });
    await nodes.setEnabled(db, false);
    await radio.updateStationSettings(db, { radio_receipts_enabled: false });
    expect((await node('/node/heard', listener.key, { callSign: CALL, preset: 'fm-standard', snrDb: 12, hashes: ['0'.repeat(32)] })).statusCode).toBe(404);
  });
});
