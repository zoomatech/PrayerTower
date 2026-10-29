import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as coverage from '../src/modules/radio/coverage.js';
import * as digest from '../src/modules/radio/digest.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as radio from '../src/modules/radio/index.js';
import * as setup from '../src/modules/radio/setup.js';
import * as tokens from '../src/modules/tokens/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const wizardDefault = await setup.enabled(db);
const coverageDefault = await coverage.settings(db);
const digestDefault = await digest.settings(db);
const reportsDefault = await nodes.enabled(db);
const stationHeaders = { 'x-station-key': STATION_KEY };
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

let admin: string;
let member: string;
let nodeKey: string;
let nodeId: string;
beforeAll(async () => {
  admin = await createUser('Setup Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Setup Member');
  // Earlier runs' open tests would block the one-at-a-time rule.
  await db.query(`update public.radio_setup_tests set status = 'failed', error = 'test reset' where status in ('requested', 'sending', 'sent')`);
  const created = (await as(admin).post('/admin/radio-nodes', { name: `Hilltop ${RUN}` })).json();
  nodeKey = created.key;
  nodeId = created.node.id;
});
afterAll(async () => {
  await setup.setEnabled(db, wizardDefault);
  await coverage.updateSettings(db, { enabled: coverageDefault.enabled, tileUrl: coverageDefault.tileUrl, station: coverageDefault.station });
  await digest.updateSettings(db, digestDefault);
  await nodes.setEnabled(db, reportsDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query(`update public.radio_setup_tests set status = 'failed', error = 'test reset' where status in ('requested', 'sending', 'sent')`);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

describe('station setup wizard', () => {
  it('is off by default: no tests can be requested and the station sees none', async () => {
    expect(wizardDefault).toBe(false);
    expect((await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders })).statusCode).toBe(204);
  });

  it('is for admins only', async () => {
    expect((await as(member).get('/admin/radio-setup')).statusCode).toBe(403);
  });

  it('writes the settings lines for the chosen radio', async () => {
    const res = await as(admin).patch('/admin/radio-setup', { enabled: true, choice: { rig: 'ic-7300', port: '/dev/serial/by-id/usb-IC-7300', speed: 19200, band: 'hf', frequencyHz: 14_100_000 } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.enabled).toBe(true);
    expect(body.env.rigctld).toEqual(['RIG_MODEL=3073', 'RIG_DEVICE=/dev/serial/by-id/usb-IC-7300', 'RIG_SPEED=19200', 'RIG_EXTRA_ARGS=']);
    expect(body.env.station).toEqual(['BURST_MODE=audio', 'RIG_CONTROL=rigctld', 'BURST_PRESET=hf-standard', 'RIG_MODE=PKTUSB', 'RIG_PASSBAND_HZ=3000', 'RIG_FREQ_HZ=14100000']);
    expect(body.rigs.length).toBeGreaterThan(10);
    expect(setup.envFor({ rig: 'vox', band: 'fm', frequencyHz: 146_550_000 }).station).toEqual(['BURST_MODE=audio', 'RIG_CONTROL=off', 'BURST_PTT_ON_CMD=', 'BURST_PTT_OFF_CMD=', 'BURST_PRESET=fm-standard', 'STATION_FREQ_HZ=146550000']);
    expect(setup.envFor({ rig: 'ptt-only', port: '/dev/ttyUSB1' }).rigctld).toEqual(['RIG_MODEL=1', 'RIG_DEVICE=', 'RIG_SPEED=', 'RIG_EXTRA_ARGS=-p /dev/ttyUSB1 -P RTS']);
    expect(setup.envFor({ rig: 'other', model: 1035 }).rigctld[0]).toBe('RIG_MODEL=1035');
    // A port is a device path, never shell text.
    expect((await as(admin).patch('/admin/radio-setup', { choice: { port: '/dev/ttyUSB0; rm -rf /' } })).statusCode).toBe(400);
  });

  it('plays a test tone: the station picks it up and reports the level', async () => {
    const t = (await as(admin).post('/admin/radio-setup/tests', { kind: 'tone', seconds: 5 })).json().test;
    expect(t).toMatchObject({ kind: 'tone', status: 'requested', seconds: 5 });
    // One at a time.
    expect((await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).statusCode).toBe(409);
    const claimed = await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders });
    expect(claimed.json().test).toMatchObject({ id: t.id, kind: 'tone', seconds: 5 });
    expect((await app.inject({ method: 'GET', url: '/station/setup-test', headers: stationHeaders })).statusCode).toBe(204);
    const done = await app.inject({ method: 'POST', url: `/station/setup-test/${t.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, peakDbfs: -11 } });
    expect(done.statusCode).toBe(200);
    const view = (await as(admin).get('/admin/radio-setup')).json();
    expect(view.tests.find((x: { id: string }) => x.id === t.id)).toMatchObject({ id: t.id, status: 'sent', peak_dbfs: -11, call_sign: CALL });
  });

  it('sends a test burst that a listener node decodes: heard, with its signal and level, and no prayer receipts', async () => {
    const t = (await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).json().test;
    await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders });
    const hash = fingerprint(`Station test ${t.code}`);
    await app.inject({ method: 'POST', url: `/station/setup-test/${t.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: hash } });
    const heard = await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, preset: 'fm-standard', snrDb: 24.4, hashes: [hash], peakDbfs: -0.3 } });
    expect(heard.statusCode).toBe(200);
    expect(heard.json().matched).toBe(1);
    const test = (await as(admin).get('/admin/radio-setup')).json().tests.find((x: { id: string }) => x.id === t.id);
    expect(test).toMatchObject({ status: 'heard', heard_by: `Hilltop ${RUN}`, heard_snr_db: 24.4, heard_peak_dbfs: -0.3, advice: 'hot' });
  });

  it('reports a failed key-up, and lets the operator confirm a decode by hand', async () => {
    const t = (await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).json().test;
    await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders });
    await app.inject({ method: 'POST', url: `/station/setup-test/${t.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint('x') } });
    const confirmed = await as(admin).post(`/admin/radio-setup/tests/${t.id}/confirm`);
    expect(confirmed.json().test).toMatchObject({ status: 'heard', heard_by: 'Confirmed by the operator' });

    const bad = (await as(admin).post('/admin/radio-setup/tests', { kind: 'tone' })).json().test;
    await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders });
    await app.inject({ method: 'POST', url: `/station/setup-test/${bad.id}/result`, headers: stationHeaders, payload: { ok: false, callSign: CALL, error: 'PTT did not key' } });
    const view = (await as(admin).get('/admin/radio-setup')).json();
    expect(view.tests.find((x: { id: string }) => x.id === bad.id)).toMatchObject({ id: bad.id, status: 'failed', error: 'PTT did not key' });
    // A tone can't be "confirmed heard".
    expect((await as(admin).post(`/admin/radio-setup/tests/${bad.id}/confirm`)).statusCode).toBe(404);
  });

  it('fails a test the station never picks up, so the wizard does not wait forever', async () => {
    const t = (await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).json().test;
    await db.query(`update public.radio_setup_tests set created_at = now() - interval '6 minutes' where id = $1`, [t.id]);
    expect((await setup.recent(db, 50)).find((x) => x.id === t.id)).toMatchObject({ status: 'failed', error: expect.stringMatching(/did not pick the test up/) });
  });

  it('gives level advice', () => {
    expect([setup.levelAdvice(null), setup.levelAdvice(-0.2), setup.levelAdvice(-12), setup.levelAdvice(-40)]).toEqual([null, 'hot', 'good', 'quiet']);
  });
});

describe('coverage map', () => {
  it('ignores a node\'s location while the map is off', async () => {
    expect(coverageDefault.enabled).toBe(false);
    await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': nodeKey }, payload: { location: { lat: 39.78, lon: -89.66, place: 'Springfield, IL' } } });
    const { rows } = await db.query('select lat, place from public.radio_nodes where id = $1', [nodeId]);
    expect(rows[0]).toEqual({ lat: null, place: null });
  });

  it('places an opted-in node, rounded to about a city, with the signal it hears', async () => {
    const on = await as(admin).patch('/admin/radio-coverage', { enabled: true, station: { lat: 40.1164, lon: -88.2434 }, tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' });
    expect(on.json()).toMatchObject({ enabled: true, station: { lat: 40.1, lon: -88.2 }, tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' });
    expect((await as(admin).patch('/admin/radio-coverage', { tileUrl: 'http://evil.test/x.png' })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': nodeKey }, payload: { location: { lat: 39.7817, lon: -89.6612, place: 'Springfield, IL' } } });
    await nodes.setEnabled(db, true);
    for (const snrDb of [12, 18, 30]) await app.inject({ method: 'POST', url: '/node/channel-report', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, preset: 'fm-standard', snrDb } });
    const map = (await as(admin).get('/admin/radio-coverage')).json();
    const point = map.points.find((p: { id: string }) => p.id === nodeId);
    expect(point).toMatchObject({ lat: 39.8, lon: -89.7, place: 'Springfield, IL', reports: 3, quality: 'fair' });
    expect(point.snrDb).toBe(18);
  });

  it('shows what a node listens with: an RTL-SDR dongle or a sound card', async () => {
    const r = await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': nodeKey }, payload: { receiver: { kind: 'rtl-sdr', freqHz: 146_520_000, mode: 'fm' } } });
    expect(r.statusCode).toBe(200);
    const map = (await as(admin).get('/admin/radio-coverage')).json();
    expect(map.points.find((p: { id: string }) => p.id === nodeId).receiver).toEqual({ kind: 'rtl-sdr', freqHz: 146_520_000, mode: 'fm' });
    expect((await as(admin).get('/admin/radio-nodes')).json().nodes.find((n: { id: string }) => n.id === nodeId).receiver).toMatchObject({ kind: 'rtl-sdr' });
    expect((await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': nodeKey }, payload: { receiver: { kind: 'tv-tuner' } } })).statusCode).toBe(400);
  });

  it('lets an admin place or remove a node by hand', async () => {
    const other = (await as(admin).post('/admin/radio-nodes', { name: `Valley ${RUN}` })).json().node;
    let map = (await as(admin).get('/admin/radio-coverage')).json();
    expect(map.unplaced.map((n: { id: string }) => n.id)).toContain(other.id);
    map = (await as(admin).put(`/admin/radio-nodes/${other.id}/location`, { location: { lat: 41.88, lon: -87.63, place: 'Chicago' } })).json();
    expect(map.points.find((p: { id: string }) => p.id === other.id)).toMatchObject({ lat: 41.9, lon: -87.6, quality: 'none', snrDb: null });
    map = (await as(admin).put(`/admin/radio-nodes/${other.id}/location`, { location: null })).json();
    expect(map.points.some((p: { id: string }) => p.id === other.id)).toBe(false);
    await as(admin).delete(`/admin/radio-nodes/${other.id}`);
  });

  it('grades signal quality', () => {
    expect([coverage.quality(null), coverage.quality(5), coverage.quality(10), coverage.quality(25)]).toEqual(['none', 'weak', 'fair', 'strong']);
  });
});

describe('weekly radio digest', () => {
  it('is off by default and shows nothing', async () => {
    expect(digestDefault).toEqual({ enabled: false, email: false });
    expect((await as(admin).get('/admin/radio-digest')).json()).toEqual({ enabled: false, email: false, weeks: [] });
    expect(await digest.runWeekly(db, async () => {})).toEqual({ week: null, emailed: 0 });
  });

  it('counts aired, heard and answered by week, and emails admins once', async () => {
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    const before = (await as(admin).patch('/admin/radio-digest', { enabled: true })).json().weeks.at(-1);
    const post = await newRequest(member, `Digest request ${RUN}.`);
    await as(member).post(`/posts/${post.id}/radio`, { idempotencyKey: `digest-${RUN}` });
    const batch = (await app.inject({ method: 'POST', url: '/station/claim-batch', headers: stationHeaders, payload: { max: 50 } })).json().radioPrayers as { id: string; text: string }[];
    for (const p of batch) await app.inject({ method: 'POST', url: `/station/radio-prayers/${p.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p.text) } });
    await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, preset: 'fm-standard', snrDb: 20, hashes: [fingerprint(`Digest request ${RUN}.`)] } });
    await as(member).post(`/posts/${post.id}/answered`);
    const weeks = (await as(admin).get('/admin/radio-digest')).json().weeks;
    expect(weeks).toHaveLength(8);
    const now = weeks.at(-1);
    expect(now.aired - before.aired).toBe(batch.length);
    expect(now.heard - before.heard).toBe(1);
    expect(now.answered - before.answered).toBe(1);

    // Monday's run: last week stored and emailed to every admin, once.
    await digest.updateSettings(db, { email: true });
    const sent: Mail[] = [];
    const nextWeek = new Date(Date.now() + 7 * 864e5);
    await db.query(`delete from public.radio_digests where week_start = date_trunc('week', now() at time zone 'UTC')::date`);
    const r = await digest.runWeekly(db, async (m) => void sent.push(m), nextWeek);
    expect(r.week).toBe(now.week_start);
    expect(r.emailed).toBeGreaterThan(0);
    expect(sent.length).toBe(r.emailed);
    expect(sent[0]!.subject).toBe(`Radio prayers, week of ${now.week_start}`);
    expect(sent[0]!.text).toContain(`Aired: ${now.aired}`);
    expect(sent[0]!.html).not.toContain(`Digest request ${RUN}`);
    expect((await digest.runWeekly(db, async (m) => void sent.push(m), nextWeek)).emailed).toBe(0);
  });
});
