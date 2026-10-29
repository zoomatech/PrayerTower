import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const scheduleDefaults = await schedule.get(db);
const consoleDefaults = await operatorConsole.settings(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

let admin: string;
let operator: string;
let member: string;
let poster: string;
beforeAll(async () => {
  admin = await createUser('Console Admin');
  await grantRole(db, admin, 'admin', null);
  operator = await createUser('Console Operator');
  member = await createUser('Console Member');
  poster = await createUser('Console Poster');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 1 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await schedule.update(db, { enabled: scheduleDefaults.enabled, windows: scheduleDefaults.windows });
  await operatorConsole.setEnabled(db, consoleDefaults.enabled);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

describe('operator console', () => {
  it('is off by default; admins turn it on; admins and radio operators use it, no one else', async () => {
    expect(consoleDefaults).toMatchObject({ enabled: false, paused: false });
    expect((await as(admin).get('/radio/console')).statusCode).toBe(404);
    expect((await as(admin).patch('/admin/radio-console', { enabled: true })).json()).toEqual({ enabled: true });
    expect((await as(operator).get('/radio/console')).statusCode).toBe(403);
    // The admin screen's role list includes the new role.
    expect((await as(admin).put(`/admin/people/${operator}/roles/radio_operator`, {})).statusCode).toBeLessThan(300);
    expect((await as(operator).get('/radio/console')).statusCode).toBe(200);
    expect((await as(member).get('/radio/console')).statusCode).toBe(403);
    expect((await as(member).patch('/radio/console', { paused: true })).statusCode).toBe(403);
  });

  it('shows the queue, the window, each station ID timer and the log', async () => {
    const p = await newRequest(poster, `Console queued prayer ${RUN}.`);
    await db.query('update public.posts set urgency = 2 where id = $1', [p.id]);
    expect((await as(member).post(`/posts/${p.id}/radio`, { idempotencyKey: `console-${RUN}` })).statusCode).toBe(201);
    await station('/station/status', { callSign: CALL, checks: [{ name: 'station_id', ok: true, detail: 'last=2026-10-29T08:00:00.000Z every=10' }] });
    const v = (await as(operator).get('/radio/console')).json();
    expect(v).toMatchObject({ paused: false, windowOverrideUntil: null, onAirNow: true });
    expect(v.queue.queued).toBeGreaterThanOrEqual(1);
    expect(v.queue.next).toContainEqual(expect.objectContaining({ text: `Console queued prayer ${RUN}.`, urgency: 2 }));
    expect(v.stations).toContainEqual(expect.objectContaining({ callSign: CALL, lastIdAt: '2026-10-29T08:00:00.000Z', everyMinutes: 10, nextIdAt: '2026-10-29T08:10:00.000Z' }));
    // It goes out, and shows in the log.
    const c = (await station('/station/claim')).json().radioPrayer;
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: CALL });
    const after = (await as(operator).get('/radio/console')).json();
    expect(after.log[0]).toMatchObject({ callSign: CALL, status: 'transmitted', text: `Console queued prayer ${RUN}.` });
  });

  it('hold stops the station being handed anything until resumed', async () => {
    const p = await newRequest(poster, `Console held prayer ${RUN}.`);
    await as(member).post(`/posts/${p.id}/radio`, { idempotencyKey: `console-held-${RUN}` });
    expect((await as(operator).patch('/radio/console', { paused: true })).json()).toMatchObject({ paused: true, onAirNow: false });
    expect((await station('/station/claim')).statusCode).toBe(204);
    expect((await as(operator).patch('/radio/console', { paused: false })).json().onAirNow).toBe(true);
    const c = (await station('/station/claim')).json().radioPrayer;
    expect(c.text).toBe(`Console held prayer ${RUN}.`);
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: CALL });
  });

  it('the window override sends outside the transmission windows until it runs out or is ended', async () => {
    // A window that is never open now: tomorrow-only, one minute.
    const day = (new Date().getUTCDay() + 3) % 7;
    await schedule.update(db, { enabled: true, timeZone: 'UTC', windows: [{ days: [day], start: '03:00', end: '03:01' }] });
    const p = await newRequest(poster, `Console override prayer ${RUN}.`);
    await as(member).post(`/posts/${p.id}/radio`, { idempotencyKey: `console-override-${RUN}` });
    expect((await as(operator).get('/radio/console')).json()).toMatchObject({ onAirNow: false, schedule: { inWindow: false } });
    expect((await station('/station/claim')).statusCode).toBe(204);
    const on = (await as(operator).patch('/radio/console', { windowOverrideMinutes: 30 })).json();
    expect(on.onAirNow).toBe(true);
    expect(Date.parse(on.windowOverrideUntil) - Date.now()).toBeGreaterThan(29 * 60_000);
    const c = (await station('/station/claim')).json().radioPrayer;
    expect(c.text).toBe(`Console override prayer ${RUN}.`);
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: CALL });
    expect((await as(operator).patch('/radio/console', { windowOverrideMinutes: 0 })).json()).toMatchObject({ onAirNow: false, windowOverrideUntil: null });
    await schedule.update(db, { enabled: false });
  });

  it('lists relays that reported with their heartbeat in the last hour', async () => {
    const key = (await as(admin).post('/admin/radio-nodes', { name: `Ridge relay ${RUN}` })).json().key;
    const relay = { callSign: 'K1RLY', relayedLastHour: 3, secondsLastHour: 4.2, budgetSeconds: 120, skipped: { duplicate: 2 } };
    const r = await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': key }, payload: { relay } });
    expect(r.statusCode).toBe(200);
    expect((await as(operator).get('/radio/console')).json().relays).toContainEqual(expect.objectContaining({ node: `Ridge relay ${RUN}`, ...relay }));
    expect((await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': key }, payload: { relay: { ...relay, skipped: { bogus: 1 } } } })).statusCode).toBe(400);
  });

  it('turning the console off lifts a hold, so nothing stays held by a screen no one can see', async () => {
    await as(operator).patch('/radio/console', { paused: true });
    await as(admin).patch('/admin/radio-console', { enabled: false });
    expect(await operatorConsole.settings(db)).toMatchObject({ enabled: false, paused: false, windowOverrideUntil: null });
    expect((await as(operator).patch('/radio/console', { paused: true })).statusCode).toBe(404);
  });
});
