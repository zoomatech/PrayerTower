import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as health from '../src/modules/radio/health.js';
import * as radio from '../src/modules/radio/index.js';
import * as operatorAlerts from '../src/modules/radio/operator-alerts.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const healthDefaults = await health.settings(db);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `W${RUN}`;
const report = (checks: { name: string; ok: boolean; detail: string }[]) =>
  app.inject({ method: 'POST', url: '/station/status', headers: { 'x-station-key': STATION_KEY }, payload: { callSign: CALL, checks } });
const notices = async (userId: string) =>
  (await db.query<{ kind: string; title: string; body: string }>(`select kind, title, body from public.notifications where user_id = $1 and kind like 'radio_alert%' order by created_at`, [userId])).rows;

let admin: string;
let operator: string;
let member: string;
beforeAll(async () => {
  admin = await createUser('Alerts Admin');
  await grantRole(db, admin, 'admin', null);
  operator = await createUser('Alerts Operator');
  await grantRole(db, operator, 'radio_operator', admin);
  member = await createUser('Alerts Member');
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
  // The health card in Admin → Radio stays off: operator alerts have their own switch.
  await health.updateSettings(db, { enabled: false });
  await db.query('delete from public.station_status');
  await db.query('delete from public.station_bursts');
});
afterAll(async () => {
  await operatorAlerts.setEnabled(db, false);
  await radio.updateStationSettings(db, stationDefaults);
  await health.updateSettings(db, { enabled: healthDefaults.station_alerts_enabled });
  await db.end();
});

describe('operator alerts', () => {
  it('are off by default and only admins switch them', async () => {
    expect((await as(admin).get('/admin/radio-operator-alerts')).json()).toEqual({ enabled: false });
    expect((await as(operator).patch('/admin/radio-operator-alerts', { enabled: true })).statusCode).toBe(403);
    await report([{ name: 'audio', ok: false, detail: 'No sound card listed.' }]);
    expect(await operatorAlerts.check(db)).toEqual({ opened: [], cleared: [] });
    expect((await as(admin).patch('/admin/radio-operator-alerts', { enabled: true })).json()).toEqual({ enabled: true });
  });

  it('push a new problem once to operators and admins, never to members, and say when it clears', async () => {
    const first = await operatorAlerts.check(db);
    expect(first.opened).toContain(`no_audio_device:${CALL}`);
    expect(await operatorAlerts.check(db)).toEqual({ opened: [], cleared: [] });
    for (const who of [operator, admin]) {
      expect(await notices(who)).toEqual([{ kind: 'radio_alert', title: 'Station: no sound card', body: `${CALL}: No sound card listed.` }]);
    }
    expect(await notices(member)).toEqual([]);

    await report([{ name: 'audio', ok: true, detail: 'card 1' }]);
    expect((await operatorAlerts.check(db)).cleared).toContain(`no_audio_device:${CALL}`);
    expect((await notices(operator)).at(-1)).toEqual({ kind: 'radio_alert_cleared', title: 'Back to normal: Station: no sound card', body: `${CALL} is fine again.` });
    // The "back to normal" notice is in-app only.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from graphile_worker._private_jobs j join public.notifications n on n.id::text = j.payload ->> 'notificationId' where n.kind = 'radio_alert_cleared'`,
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('a problem that comes back is announced again; turning off forgets what was open', async () => {
    await report([{ name: 'audio', ok: false, detail: 'No sound card listed.' }]);
    expect((await operatorAlerts.check(db)).opened).toHaveLength(1);
    await operatorAlerts.setEnabled(db, false);
    expect((await db.query('select 1 from public.radio_open_alerts')).rowCount).toBe(0);
  });
});
