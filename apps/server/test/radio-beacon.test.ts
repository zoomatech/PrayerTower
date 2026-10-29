import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as beacon from '../src/modules/radio/beacon.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as setup from '../src/modules/radio/setup.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const beaconDefaults = await beacon.settings(db);
const consoleDefaults = await operatorConsole.settings(db);
const wizardDefault = await setup.enabled(db);
const stationHeaders = { 'x-station-key': STATION_KEY };
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `N${RUN}`;
const claim = () => app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: stationHeaders });

let admin: string;
let member: string;
const keys: string[] = [];
beforeAll(async () => {
  admin = await createUser('Beacon Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Beacon Member');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
  await setup.setEnabled(db, false);
  await db.query(`update public.radio_setup_tests set status = 'failed', error = 'test reset' where status in ('requested', 'sending', 'sent')`);
  // Earlier runs' beacons (some dated ahead) would make the next one look not yet due.
  await db.query('delete from public.radio_setup_tests where beacon');
  for (const name of [`North ${RUN}`, `South ${RUN}`]) keys.push((await as(admin).post('/admin/radio-nodes', { name })).json().key);
});
afterAll(async () => {
  await beacon.update(db, beaconDefaults);
  await operatorConsole.setEnabled(db, consoleDefaults.enabled);
  await setup.setEnabled(db, wizardDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await db.query(`update public.radio_setup_tests set status = 'failed', error = 'test reset' where status in ('requested', 'sending', 'sent')`);
  await db.end();
});

describe('reception beacon', () => {
  it('is off by default and admin-only; nothing is queued or claimed while off', async () => {
    expect(beaconDefaults).toEqual({ enabled: false, minutes: 60 });
    expect((await as(member).patch('/admin/radio-beacon', { enabled: true })).statusCode).toBe(403);
    expect(await beacon.queueDue(db)).toBeNull();
    expect((await claim()).statusCode).toBe(204);
    expect((await as(admin).patch('/admin/radio-beacon', { minutes: 5 })).statusCode).toBe(400);
  });

  it('queues one every N minutes; the station sends it with the wizard off; every listener that heard it is kept', async () => {
    expect((await as(admin).patch('/admin/radio-beacon', { enabled: true, minutes: 30 })).json()).toEqual({ enabled: true, minutes: 30 });
    const t0 = new Date();
    const id = await beacon.queueDue(db, t0);
    expect(id).toBeTruthy();
    expect(await beacon.queueDue(db, new Date(t0.getTime() + 10 * 60_000))).toBeNull();
    const test = (await claim()).json().test;
    expect(test).toMatchObject({ id, kind: 'burst' });
    const hash = fingerprint(`Station test ${test.code}`);
    await app.inject({ method: 'POST', url: `/station/setup-test/${id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: hash } });
    for (const [i, key] of keys.entries()) {
      const r = await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': key }, payload: { callSign: CALL, preset: 'fm-standard', snrDb: 10 + i * 8, hashes: [hash] } });
      expect(r.statusCode).toBe(200);
    }
    const rows = await beacon.recent(db);
    expect(rows[0]).toMatchObject({ id, status: 'heard', callSign: CALL, preset: 'fm-standard' });
    expect(rows[0]!.heard).toEqual([
      { by: `South ${RUN}`, snrDb: 18, peakDbfs: null },
      { by: `North ${RUN}`, snrDb: 10, peakDbfs: null },
    ]);
    // Due again once the interval has passed.
    expect(await beacon.queueDue(db, new Date(t0.getTime() + 31 * 60_000))).toBeTruthy();
    await db.query(`update public.radio_setup_tests set status = 'failed' where beacon and status = 'requested'`);
  });

  it('shows on the operator console, and never goes out while held', async () => {
    await operatorConsole.setEnabled(db, true);
    const v = (await as(admin).get('/radio/console')).json();
    expect(v.beacon).toMatchObject({ enabled: true, minutes: 30 });
    expect(v.beacon.recent.find((r: { status: string }) => r.status === 'heard').heard).toHaveLength(2);
    await as(admin).patch('/radio/console', { paused: true });
    expect(await beacon.queueDue(db, new Date(Date.now() + 2 * 3_600_000))).toBeNull();
    await as(admin).patch('/radio/console', { paused: false });
    // Queued, then held before the station picks it up: the station is handed nothing.
    expect(await beacon.queueDue(db, new Date(Date.now() + 2 * 3_600_000))).toBeTruthy();
    await as(admin).patch('/radio/console', { paused: true });
    expect((await claim()).statusCode).toBe(204);
    await as(admin).patch('/radio/console', { paused: false });
    // Switching it off drops the waiting beacon.
    await as(admin).patch('/admin/radio-beacon', { enabled: false });
    expect((await db.query(`select 1 from public.radio_setup_tests where beacon and status = 'requested'`)).rowCount).toBe(0);
  });
});
