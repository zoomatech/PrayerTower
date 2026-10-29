import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as sky from '../src/modules/radio/sky.js';
import { nextCrossing, pointAt } from '../src/modules/radio/sky-math.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const skyDefaults = await sky.settings(db);
const consoleDefaults = await operatorConsole.settings(db);
const station = () => app.inject({ method: 'GET', url: '/station/sky', headers: { 'x-station-key': STATION_KEY } });

let admin: string;
let member: string;
beforeAll(async () => {
  admin = await createUser('Sky Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Sky Member');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
});
afterAll(async () => {
  await sky.update(db, { ...skyDefaults, custom: skyDefaults.custom });
  await operatorConsole.setEnabled(db, consoleDefaults.enabled);
  await radio.updateStationSettings(db, stationDefaults);
  await db.end();
});

describe('sky pointing math', () => {
  // Reference values from PyEphem 4.2.1 (no refraction), Springfield IL (39.8 N, 89.7 W) and Sydney (33.9 S, 151.2 E).
  it('puts the Moon within 0.3° of an independent ephemeris', () => {
    const cases: [string, number, number][] = [
      ['2026-10-29T12:00:00Z', 268.02, 48.33],
      ['2026-11-03T03:30:00Z', 40.37, -28.92],
      ['2027-01-15T20:00:00Z', 101.09, 34.03],
    ];
    for (const [at, az, el] of cases) {
      const p = pointAt('moon', 39.8, -89.7, new Date(at))!;
      expect(Math.abs(p.az - az)).toBeLessThan(0.3);
      expect(Math.abs(p.el - el)).toBeLessThan(0.3);
    }
  });

  it('puts Alpha Centauri within 0.6° (precession since 2000 is left out), and never above an Illinois horizon', () => {
    const p = pointAt('alpha_centauri', -33.9, 151.2, new Date('2026-11-03T03:30:00Z'))!;
    expect(Math.abs(p.az - 203.62)).toBeLessThan(0.6);
    expect(Math.abs(p.el - 58.29)).toBeLessThan(0.6);
    expect(pointAt('alpha_centauri', 39.8, -89.7, new Date('2026-10-29T12:00:00Z'))!.el).toBeLessThan(0);
    expect(nextCrossing('alpha_centauri', 39.8, -89.7, new Date('2026-10-29T12:00:00Z'), 0)).toBeNull();
    expect(pointAt('zenith', 39.8, -89.7, new Date())).toEqual({ az: 0, el: 90 });
  });
});

describe('sky target', () => {
  it('is off by default, admin-only, and the station sees nothing while off', async () => {
    expect(skyDefaults).toMatchObject({ enabled: false, target: 'zenith', holdBelow: false, minElevation: 10 });
    expect((await as(member).patch('/admin/radio-sky', { enabled: true })).statusCode).toBe(403);
    expect((await station()).statusCode).toBe(204);
  });

  it('points at the Moon from the dish location, and the console shows it with the next rise or set', async () => {
    const r = (await as(admin).patch('/admin/radio-sky', { enabled: true, target: 'moon', location: { lat: 39.8123, lon: -89.6543 } })).json();
    expect(r.settings.location).toEqual({ lat: 39.81, lon: -89.65 });
    expect(r.now).toMatchObject({ target: 'moon' });
    expect(r.now.next).toMatchObject({ rising: expect.any(Boolean) });
    const s = (await station()).json();
    expect(s.az).toBeGreaterThanOrEqual(0);
    expect(s.az).toBeLessThan(360);
    await operatorConsole.setEnabled(db, true);
    expect((await as(admin).get('/radio/console')).json().sky).toMatchObject({ target: 'moon', minElevation: 10 });
    expect((await as(admin).patch('/admin/radio-sky', { target: 'mars' })).statusCode).toBe(400);
  });

  it('holds transmissions while the target is below the minimum, only when that is chosen', async () => {
    // Alpha Centauri never rises over Illinois.
    await as(admin).patch('/admin/radio-sky', { target: 'alpha_centauri' });
    expect(await operatorConsole.mayTransmit(db)).toBe(true);
    await as(admin).patch('/admin/radio-sky', { holdBelow: true });
    expect(await operatorConsole.mayTransmit(db)).toBe(false);
    // Even the window override does not lift it.
    await as(admin).patch('/radio/console', { windowOverrideMinutes: 30 });
    expect(await operatorConsole.mayTransmit(db)).toBe(false);
    await as(admin).patch('/admin/radio-sky', { target: 'zenith' });
    expect(await operatorConsole.mayTransmit(db)).toBe(true);
    await as(admin).patch('/radio/console', { windowOverrideMinutes: 0 });
    // A custom RA/Dec: Polaris stays about 40° up over Illinois.
    const c = (await as(admin).patch('/admin/radio-sky', { target: 'custom', custom: { name: 'Polaris', raHours: 2.5303, decDeg: 89.2641 } })).json();
    expect(c.now).toMatchObject({ name: 'Polaris', aboveMinimum: true });
    expect(Math.abs(c.now.el - 39.8)).toBeLessThan(1.5);
  });
});
