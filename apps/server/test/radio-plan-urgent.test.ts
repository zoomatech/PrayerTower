import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as bandPlan from '../src/modules/radio/band-plan.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as coverage from '../src/modules/radio/coverage.js';
import * as radio from '../src/modules/radio/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as urgent from '../src/modules/radio/urgent.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const planDefault = await bandPlan.settings(db);
const urgentDefault = await urgent.settings(db);
const coverageDefault = await coverage.settings(db);
const scheduleDefault = await schedule.get(db);
const consoleDefault = await operatorConsole.settings(db);
const reportsDefault = await nodes.enabled(db);
const stationHeaders = { 'x-station-key': STATION_KEY };
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

const HF: bandPlan.Band[] = [
  { label: '80 m', freqHz: 3_583_000, mode: 'usb' },
  { label: '40 m', freqHz: 7_103_000, mode: 'usb' },
  { label: '30 m', freqHz: 10_143_000, mode: 'usb' },
  { label: '20 m', freqHz: 14_103_000, mode: 'usb', preset: 'hf-standard' },
  { label: '15 m', freqHz: 21_103_000, mode: 'usb' },
  { label: '10 m', freqHz: 28_103_000, mode: 'usb' },
];
const FM: bandPlan.Band = { label: '2 m FM', freqHz: 146_520_000, mode: 'fm' };

let admin: string;
let operator: string;
let member: string;
beforeAll(async () => {
  admin = await createUser('Plan Admin');
  await grantRole(db, admin, 'admin', null);
  operator = await createUser('Plan Operator');
  await grantRole(db, operator, 'radio_operator', admin);
  member = await createUser('Plan Member');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
});
afterAll(async () => {
  await db.query('update public.token_settings set band_plan_enabled = $1, band_plan = $2, space_weather = $3', [planDefault.enabled, JSON.stringify(planDefault.bands), planDefault.spaceWeather]);
  await urgent.updateSettings(db, urgentDefault);
  await coverage.updateSettings(db, { enabled: coverageDefault.enabled, station: coverageDefault.station });
  await schedule.update(db, scheduleDefault);
  await operatorConsole.setEnabled(db, consoleDefault.enabled);
  await nodes.setEnabled(db, reportsDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

describe('HF band pick', () => {
  const noonUtc = new Date('2026-10-29T18:00:00Z'); // about local solar noon at 89.6 W
  const midnightUtc = new Date('2026-10-30T06:00:00Z');
  const lon = -89.6;

  it('turns the solar flux into a sunspot number as the statistical formula does', () => {
    expect(bandPlan.sunspotsFromFlux(67)).toBe(0);
    expect(bandPlan.sunspotsFromFlux(60)).toBe(0);
    expect(bandPlan.sunspotsFromFlux(150)).toBeGreaterThan(95);
    expect(bandPlan.sunspotsFromFlux(150)).toBeLessThan(115);
  });

  it('reaches higher bands by day and with more sunspots, lower at night and in a storm', () => {
    const quiet = { sfi: 150, kp: 1 };
    const day = bandPlan.estimateMuf(quiet, lon, noonUtc);
    const night = bandPlan.estimateMuf(quiet, lon, midnightUtc);
    expect(day).toBeGreaterThan(night * 1.8);
    expect(bandPlan.estimateMuf({ sfi: 70, kp: 1 }, lon, noonUtc)).toBeLessThan(day);
    expect(bandPlan.estimateMuf({ sfi: 150, kp: 6 }, lon, noonUtc)).toBeCloseTo(day * 0.85, 5);

    const pick = (sfi: number, kp: number, at: Date) => bandPlan.pick({ bands: HF, spaceWeather: { sfi, kp, fluxAt: '', fetchedAt: '' } }, lon, at)!;
    expect(pick(150, 1, noonUtc)).toMatchObject({ band: { label: '20 m' }, reason: 'hf' });
    expect(pick(220, 1, noonUtc).band.label).toMatch(/^(15|10) m$/);
    expect(pick(150, 1, midnightUtc).band.label).toMatch(/^(80|40) m$/);
    expect(pick(75, 1, noonUtc).band.label).toMatch(/^(30|20) m$/);
    expect(pick(150, 8, noonUtc).band.freqHz).toBeLessThan(pick(150, 1, noonUtc).band.freqHz);
  });

  it('keeps it simple without HF choices or data', () => {
    expect(bandPlan.pick({ bands: [], spaceWeather: null }, 0)).toBeNull();
    expect(bandPlan.pick({ bands: [FM, HF[1]!], spaceWeather: null }, 0)).toMatchObject({ band: { label: '40 m' }, reason: 'only' });
    expect(bandPlan.pick({ bands: [FM], spaceWeather: null }, 0)).toMatchObject({ band: FM, reason: 'vhf' });
    expect(bandPlan.pick({ bands: HF, spaceWeather: null }, 0)).toMatchObject({ band: { label: '80 m' }, reason: 'no-data' });
  });
});

describe('band plan', () => {
  it('is off by default: the station gets no band', async () => {
    expect(planDefault.enabled).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/station/band', headers: stationHeaders })).statusCode).toBe(204);
    expect((await as(admin).get('/admin/band-plan')).json()).toMatchObject({ enabled: false, outlook: null });
  });

  it('is switched by admins, read by radio operators', async () => {
    expect((await as(member).get('/admin/band-plan')).statusCode).toBe(403);
    expect((await as(operator).patch('/admin/band-plan', { enabled: true })).statusCode).toBe(403);
    expect((await as(operator).get('/admin/band-plan')).statusCode).toBe(200);
    expect((await as(admin).patch('/admin/band-plan', { bands: [{ label: 'x', freqHz: 10, mode: 'usb' }] })).statusCode).toBe(400);
  });

  it('reads NOAA space weather, picks the HF band for the station, and shows the next 24 hours', async () => {
    await coverage.updateSettings(db, { station: { lat: 39.8, lon: -89.6 } });
    await as(admin).patch('/admin/band-plan', { enabled: true, bands: HF });
    const swpc = (async (url: string) => {
      if (url === bandPlan.SWPC_FLUX)
        return Response.json([
          { time_tag: '2026-10-28T20:00:00', frequency: 2800, flux: 140, reporting_schedule: 'Noon' },
          { time_tag: '2026-10-29T20:00:00', frequency: 2800, flux: 152.3, reporting_schedule: 'Noon' },
        ]);
      if (url === bandPlan.SWPC_KP)
        return Response.json([
          { time_tag: '2026-10-29T21:52:00', kp_index: 2, estimated_kp: 2.33, kp: '2P' },
          { time_tag: '2026-10-29T21:53:00', kp_index: 2, estimated_kp: 2.67, kp: '3M' },
        ]);
      return new Response('nope', { status: 404 });
    }) as typeof fetch;
    const w = await bandPlan.refresh(db, swpc, new Date('2026-10-29T22:00:00Z'));
    expect(w).toEqual({ sfi: 152.3, kp: 2.7, fluxAt: '2026-10-29T20:00:00Z', fetchedAt: '2026-10-29T22:00:00.000Z' });

    const band = await app.inject({ method: 'GET', url: '/station/band', headers: stationHeaders });
    expect(band.statusCode).toBe(200);
    expect(band.json()).toMatchObject({ reason: 'hf', band: { mode: 'usb' } });
    expect(band.json().mufMhz).toBeGreaterThan(5);
    expect((await app.inject({ method: 'GET', url: '/station/band' })).statusCode).toBe(401);

    const plan = (await as(operator).get('/admin/band-plan')).json();
    expect(plan.spaceWeather.sfi).toBe(152.3);
    expect(plan.outlook.hours).toHaveLength(24);
    expect(new Set(plan.outlook.hours.map((h: { band: string }) => h.band)).size).toBeGreaterThan(1);
    await expect(bandPlan.refresh(db, (async () => new Response('down', { status: 503 })) as typeof fetch)).rejects.toThrow(/503/);
  });

  it('shows in the operator console', async () => {
    await operatorConsole.setEnabled(db, true);
    const c = (await as(operator).get('/radio/console')).json();
    expect(c.band.now.band.label).toBeTruthy();
    expect(c.band.spaceWeather.kp).toBe(2.7);
  });
});

/** Station claims a batch and reports it sent. */
async function sendBatch() {
  const res = await app.inject({ method: 'POST', url: '/station/claim-batch', headers: stationHeaders, payload: { max: 50 } });
  const batch = (res.statusCode === 204 ? [] : res.json().radioPrayers) as { id: string; text: string; repeats: number; urgent?: boolean; preset?: string }[];
  for (const p of batch) await app.inject({ method: 'POST', url: `/station/radio-prayers/${p.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: p.preset ?? 'fm-standard', sentHash: fingerprint(p.text) } });
  return batch;
}

describe('urgent prayers', () => {
  let nodeKey: string;
  beforeAll(async () => {
    nodeKey = (await as(admin).post('/admin/radio-nodes', { name: `Urgent ${RUN}` })).json().key;
    await nodes.setEnabled(db, true);
  });

  it('are off by default', async () => {
    expect(urgentDefault).toMatchObject({ enabled: false, repeats: 3, preset: 'auto', confirmMinutes: 15, maxRetries: 2 });
    const post = await newRequest(member, `Off ${RUN}.`);
    expect((await as(admin).post('/admin/urgent-radio', { postId: post.id })).statusCode).toBe(404);
    expect((await as(operator).get('/radio/console')).json().urgent).toBeNull();
  });

  it('go first, alone in their burst, repeated, on the robust preset for the band', async () => {
    await as(admin).patch('/admin/urgent-radio', { enabled: true });
    expect((await as(member).post('/admin/urgent-radio', { postId: '00000000-0000-0000-0000-000000000000' })).statusCode).toBe(403);
    const ordinary = await newRequest(member, `Ordinary ${RUN}.`);
    await as(member).post(`/posts/${ordinary.id}/radio`, { idempotencyKey: `ord-${RUN}` });
    const post = await newRequest(member, `Urgent need ${RUN}.`);
    const flagged = await as(operator).post('/admin/urgent-radio', { postId: post.id });
    expect(flagged.statusCode).toBe(201);
    expect(flagged.json().nextWindowAt).toBeTruthy();

    // With the HF band plan on, the robust HF preset.
    const first = await sendBatch();
    expect(first).toEqual([expect.objectContaining({ text: expect.stringContaining(`Urgent need ${RUN}`), repeats: 3, urgent: true, preset: 'hf-robust' })]);
    const second = await sendBatch();
    expect(second.map((p) => p.text)).toContain(`Ordinary ${RUN}.`);
    expect(second.every((p) => !p.urgent)).toBe(true);

    // VHF only: the robust FM preset.
    await as(admin).patch('/admin/band-plan', { bands: [FM] });
    expect(await urgent.presetNow(db)).toBe('fm-robust-fec');
    await as(admin).patch('/admin/urgent-radio', { preset: 'fm-robust' });
    expect(await urgent.presetNow(db)).toBe('fm-robust');
    await as(admin).patch('/admin/urgent-radio', { preset: 'auto' });
  });

  it('are confirmed by a listener, and whoever flagged them is told', async () => {
    const post = await newRequest(member, `Confirm me ${RUN}.`);
    await as(admin).post('/admin/urgent-radio', { postId: post.id });
    const [sent] = await sendBatch();
    await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': nodeKey }, payload: { callSign: CALL, preset: 'fm-robust-fec', snrDb: 12, hashes: [fingerprint(sent!.text)] } });
    const list = (await as(operator).get('/admin/urgent-radio')).json();
    expect(list.prayers.find((p: urgent.UrgentPrayer) => p.id === sent!.id)).toMatchObject({ status: 'transmitted', heardCount: 1, confirmedAt: expect.any(String) });
    const { rows } = await db.query(`select title from public.notifications where user_id = $1 and kind = 'radio_urgent_confirmed'`, [admin]);
    expect(rows.map((r) => r.title)).toContain('A listener confirmed the urgent request');
  });

  it('go out again when no listener confirms them in time, while a listener is running', async () => {
    const post = await newRequest(member, `Unheard ${RUN}.`);
    await as(admin).post('/admin/urgent-radio', { postId: post.id });
    const [sent] = await sendBatch();
    await db.query(`update public.radio_prayers set transmitted_at = now() - interval '20 minutes' where id = $1`, [sent!.id]);
    await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': nodeKey }, payload: {} });
    const again = await sendBatch();
    expect(again).toEqual([expect.objectContaining({ id: sent!.id, urgent: true })]);
    const { rows } = await db.query('select urgent_retries from public.radio_prayers where id = $1', [sent!.id]);
    expect(rows[0].urgent_retries).toBe(1);
  });

  it('can be unflagged while waiting, and refuse requests that can’t go on the air', async () => {
    const post = await newRequest(member, `Waiting ${RUN}.`);
    await as(admin).post(`/posts/${post.id}/radio`, { idempotencyKey: `wait-${RUN}` });
    const { id } = (await as(admin).post('/admin/urgent-radio', { postId: post.id })).json();
    expect((await as(operator).delete(`/admin/urgent-radio/${id}`)).statusCode).toBe(200);
    expect((await as(operator).delete(`/admin/urgent-radio/${id}`)).statusCode).toBe(404);
    const { rows } = await db.query('select urgent, status from public.radio_prayers where id = $1', [id]);
    expect(rows[0]).toEqual({ urgent: false, status: 'queued' });
    await sendBatch();

    const hidden = await newRequest(member, `Private ${RUN}.`);
    await db.query('update public.posts set is_sensitive = true where id = $1', [hidden.id]);
    expect((await as(admin).post('/admin/urgent-radio', { postId: hidden.id })).statusCode).toBe(400);
  });

  it('say when the next window opens', async () => {
    await schedule.update(db, { enabled: true, timeZone: 'UTC', windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '19:00', end: '20:00' }], quietStart: null, quietEnd: null });
    const s = await schedule.get(db);
    expect(schedule.nextOpening(s, new Date('2026-10-29T12:03:00Z'))?.toISOString()).toBe('2026-10-29T19:00:00.000Z');
    expect(schedule.nextOpening(s, new Date('2026-10-29T19:30:00Z'))?.toISOString()).toBe('2026-10-29T19:30:00.000Z');
    expect(schedule.nextOpening({ ...s, windows: [{ days: [3], start: '19:00', end: '19:00' }], quietStart: '00:00', quietEnd: '23:59' }, new Date('2026-10-29T12:00:00Z'))).toBeNull();
    const c = (await as(operator).get('/radio/console')).json();
    expect(c.urgent.enabled).toBe(true);
    expect(c.urgent.nextWindowAt).toBeTruthy();
  });
});
