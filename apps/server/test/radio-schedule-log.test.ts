import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { listenerMode, setListenerMode } from '../src/modules/listen/routes.js';
import * as radio from '../src/modules/radio/index.js';
import * as oplog from '../src/modules/radio/oplog.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const scheduleDefaults = await schedule.get(db);
const logDefault = await oplog.enabled(db);
const listenerDefault = (await db.query<{ on: boolean }>('select listener_mode_enabled as on from public.token_settings')).rows[0]!.on;
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

let admin: string;
let sender: string;
let poster: string;
beforeAll(async () => {
  admin = await createUser('Schedule Admin');
  await grantRole(db, admin, 'admin', null);
  sender = await createUser('Schedule Sender');
  poster = await createUser('Schedule Poster');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await schedule.update(db, scheduleDefaults);
  await oplog.setEnabled(db, logDefault);
  await setListenerMode(db, listenerDefault);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

let n = 0;
async function queuePrayer(text: string) {
  const p = await newRequest(poster, text);
  await as(sender).post(`/posts/${p.id}/radio`, { idempotencyKey: `sched-${RUN}-${n++}` });
}

describe('transmission windows', () => {
  const s = (o: Partial<schedule.Schedule>): schedule.Schedule => ({ enabled: true, timeZone: 'America/Chicago', windows: [], quietStart: null, quietEnd: null, ...o });
  // Wednesday 2026-10-28 at 20:30 in Chicago (CDT, UTC-5) is 01:30 UTC on Thursday.
  const wed2030 = new Date('2026-10-29T01:30:00Z');

  it('reads the time in the schedule time zone', () => {
    expect(schedule.localTime(wed2030, 'America/Chicago')).toEqual({ day: 3, minute: 20 * 60 + 30 });
    expect(schedule.localTime(wed2030, 'UTC')).toEqual({ day: 4, minute: 90 });
  });

  it('is always on air while off; with windows, only inside one; quiet hours win', () => {
    expect(schedule.onAir(s({ enabled: false, quietStart: '00:00', quietEnd: '23:59' }), wed2030)).toBe(true);
    expect(schedule.onAir(s({}), wed2030)).toBe(true);
    expect(schedule.onAir(s({ windows: [{ days: [1, 2, 3, 4, 5], start: '18:00', end: '21:00' }] }), wed2030)).toBe(true);
    expect(schedule.onAir(s({ windows: [{ days: [0, 6], start: '18:00', end: '21:00' }] }), wed2030)).toBe(false);
    expect(schedule.onAir(s({ windows: [{ days: [3], start: '08:00', end: '12:00' }] }), wed2030)).toBe(false);
    expect(schedule.onAir(s({ quietStart: '20:00', quietEnd: '06:00' }), wed2030)).toBe(false);
    expect(schedule.onAir(s({ quietStart: '22:00', quietEnd: '06:00' }), wed2030)).toBe(true);
  });

  it('a window past midnight belongs to the day it starts', () => {
    const tuesLate = { days: [2], start: '22:00', end: '02:00' };
    // 01:00 Wednesday in Chicago is inside Tuesday's window; 01:00 Thursday is not.
    expect(schedule.onAir(s({ windows: [tuesLate] }), new Date('2026-10-28T06:00:00Z'))).toBe(true);
    expect(schedule.onAir(s({ windows: [tuesLate] }), new Date('2026-10-29T06:00:00Z'))).toBe(false);
  });

  it('outside the windows the station gets nothing and the prayers wait; an admin sets it in Admin → Radio', async () => {
    expect(scheduleDefaults.enabled).toBe(false);
    await queuePrayer(`Waits for the window ${RUN}.`);
    const quietNow = (await as(admin).patch('/admin/radio-schedule', { enabled: true, timeZone: 'UTC', quietStart: '00:00', quietEnd: '23:59', windows: [] })).json();
    expect(quietNow.onAirNow).toBe(false);
    expect((await station('/station/claim-batch', { max: 50 })).statusCode).toBe(204);
    expect((await as(admin).patch('/admin/radio-schedule', { timeZone: 'Mars/Olympus' })).statusCode).toBe(400);
    expect((await as(sender).get('/admin/radio-schedule')).statusCode).toBe(403);

    const open = (await as(admin).patch('/admin/radio-schedule', { quietStart: null, quietEnd: null })).json();
    expect(open).toMatchObject({ onAirNow: true, schedule: { enabled: true, quietStart: null, quietEnd: null } });
    const claimed = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
    expect(claimed.map((p) => p.text)).toContain(`Waits for the window ${RUN}.`);
    for (const p of claimed) await station(`/station/radio-prayers/${p.id}/result`, { ok: true, callSign: `W${RUN}`, preset: 'fm-standard', frequencyHz: 146_520_000 });
    await as(admin).patch('/admin/radio-schedule', { enabled: false });
  });
});

describe('operator log', () => {
  it('is off by default; then downloads each transmission as CSV with time, frequency, preset and contents', async () => {
    expect(logDefault).toBe(false);
    expect((await as(admin).get('/admin/operator-log')).json()).toEqual({ enabled: false });
    expect((await as(admin).get('/admin/operator-log?format=csv')).statusCode).toBe(404);
    await as(admin).patch('/admin/operator-log', { enabled: true });

    await queuePrayer(`=cmd|' /C calc'!A0 for ${RUN}, "quoted"`);
    const [p] = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
    await station(`/station/radio-prayers/${p!.id}/result`, { ok: false, callSign: `W${RUN}`, error: 'PTT did not key' });

    const res = await as(admin).get('/admin/operator-log?format=csv');
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('time_utc,call_sign,station,frequency_hz,preset,repeats,status,heard,error,contents,id');
    const sent = lines.find((l) => l.includes(`Waits for the window ${RUN}.`))!;
    expect(sent).toMatch(new RegExp(`^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\dZ,W${RUN},main,146520000,fm-standard,1,transmitted,false,,Waits for the window ${RUN}\\.,`));
    // A formula is defused, quotes are escaped, and failures are logged with their error.
    const failed = lines.find((l) => l.includes(RUN) && l.includes('failed'))!;
    expect(failed).toContain(`psk31,1,failed,false,PTT did not key,"'=cmd|' /C calc'!A0 for ${RUN}, ""quoted"""`);
    // A range with nothing in it has just the header.
    expect((await as(admin).get('/admin/operator-log?format=csv&from=2020-01-01&to=2020-01-02')).body.trim().split('\n')).toHaveLength(1);
    expect((await as(sender).get('/admin/operator-log?format=csv')).statusCode).toBe(403);
  });
});

describe('listener mode', () => {
  it('is off by default, and offers the Listen screen signed out only while the listening page is on too', async () => {
    expect(listenerDefault).toBe(false);
    const config = () => app.inject({ method: 'GET', url: '/listen/config' }).then((r) => r.json());
    expect(await config()).toEqual({ enabled: false, receipts: false, prayingToo: false });
    await as(admin).patch('/admin/radio-settings', { listenPage: false });
    expect((await as(admin).patch('/admin/listener-mode', { enabled: true })).json()).toEqual({ enabled: true, active: false });
    expect((await config()).enabled).toBe(false);
    await as(admin).patch('/admin/radio-settings', { listenPage: true, receipts: true });
    expect(await config()).toEqual({ enabled: true, receipts: true, prayingToo: false });
    expect(await listenerMode(db)).toEqual({ enabled: true, receipts: true, prayingToo: false });
    expect((await as(sender).patch('/admin/listener-mode', { enabled: false })).statusCode).toBe(403);
  });
});
