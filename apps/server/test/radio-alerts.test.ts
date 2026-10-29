import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as ops from '../src/modules/ops/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as radioHealth from '../src/modules/radio/health.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const alertDefaults = await radioHealth.settings(db);
const station = (path: string, body: object = {}, key = STATION_KEY) =>
  app.inject({ method: 'POST', url: path, headers: { 'x-station-key': key }, payload: body });
const kinds = async () => ((await as(admin).get('/admin/radio-alerts')).json().alerts as { kind: string }[]).map((a) => a.kind);

let admin: string;
beforeAll(async () => {
  admin = await createUser('Alerts Admin');
  await grantRole(db, admin, 'admin', null);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query('delete from public.station_status');
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await radioHealth.updateSettings(db, { enabled: alertDefaults.station_alerts_enabled, overdueMinutes: alertDefaults.station_overdue_minutes });
  await db.query('delete from public.station_status');
  await db.end();
});

describe('station health alerts', () => {
  it('are off by default, admin only, and say nothing while off', async () => {
    expect(alertDefaults).toEqual({ station_alerts_enabled: false, station_overdue_minutes: 30 });
    expect((await as(admin).get('/admin/radio-alerts')).json()).toEqual({ enabled: false, overdueMinutes: 30, alerts: [] });
    const outsider = await createUser('Not An Admin');
    expect((await as(outsider).get('/admin/radio-alerts')).statusCode).toBe(403);
    expect((await as(outsider).patch('/admin/radio-alerts', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/radio-alerts', { overdueMinutes: 0 })).statusCode).toBe(400);
  });

  it('take station reports with the station key only', async () => {
    const report = { callSign: 'n0call', checks: [{ name: 'audio', ok: true, detail: 'USB Audio' }] };
    expect((await station('/station/status', report)).statusCode).toBe(200);
    expect((await station('/station/status', report, 'wrong-key-wrong-key-wrong-key-00')).statusCode).toBe(401);
    expect((await station('/station/status', { callSign: 'N0CALL', checks: 'all fine' })).statusCode).toBe(400);
    const { rows } = await db.query(`select call_sign, checks from public.station_status`);
    expect(rows).toEqual([{ call_sign: 'N0CALL', checks: [{ name: 'audio', ok: true, detail: 'USB Audio' }] }]);
  });

  it('show no audio device, failed PTT, a failed burst, an empty queue and an overdue burst', async () => {
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station' });
    const on = (await as(admin).patch('/admin/radio-alerts', { enabled: true, overdueMinutes: 5 })).json();
    expect(on).toMatchObject({ enabled: true, overdueMinutes: 5 });
    await db.query('delete from public.station_bursts');
    expect(await kinds()).toEqual(['queue_empty']);

    await station('/station/status', {
      callSign: 'N0CALL',
      checks: [
        { name: 'audio', ok: false, detail: 'No sound card found' },
        { name: 'rig', ok: false, detail: 'PTT did not key' },
      ],
    });
    const list = (await as(admin).get('/admin/radio-alerts')).json().alerts;
    expect(list.map((a: { kind: string; level: string }) => [a.kind, a.level])).toEqual([
      ['no_audio_device', 'problem'],
      ['ptt_failed', 'problem'],
      ['queue_empty', 'info'],
    ]);
    expect(list[0]).toMatchObject({ callSign: 'N0CALL', detail: 'No sound card found' });

    // A failed burst whose error names PTT does not repeat the PTT alert; any other failure shows as its own.
    await station('/station/status', { callSign: 'N0CALL', checks: [] });
    await station('/station/bursts', { callSign: 'N0CALL', mode: 'audio', preset: 'fm-standard', prayers: 3, frames: 1, bytes: 90, seconds: 0, ok: false, error: 'PTT did not key: the radio reports receive' });
    expect(await kinds()).toEqual(['ptt_failed', 'queue_empty']);
    await station('/station/bursts', { callSign: 'N0CALL', mode: 'audio', preset: 'fm-standard', prayers: 3, frames: 1, bytes: 90, seconds: 0, ok: false, error: 'aplay exited with 1' });
    expect(await kinds()).toEqual(['burst_failed', 'queue_empty']);
    await station('/station/bursts', { callSign: 'N0CALL', mode: 'audio', preset: 'fm-standard', prayers: 3, frames: 1, bytes: 90, seconds: 1.2, ok: true });

    // A prayer waiting longer than the overdue limit.
    const poster = await createUser('Overdue Poster');
    const post = await newRequest(poster, 'Pray for the long wait.');
    await db.query(`insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, created_at) values ($1, $2, 0, 'alert-overdue', now() - interval '20 minutes')`, [post.id, poster]);
    const overdue = (await as(admin).get('/admin/radio-alerts')).json().alerts;
    expect(overdue).toEqual([expect.objectContaining({ kind: 'burst_overdue', level: 'problem', detail: '1 waiting; the oldest for 20 min.' })]);

    // The ops check tells admins in the app, once an hour.
    const r = await ops.check(db);
    expect(r.station).toEqual(['burst_overdue']);
    const { rows: notes } = await db.query(`select body from public.notifications where user_id = $1 and kind = 'ops_alert' order by created_at desc limit 1`, [admin]);
    expect(notes[0]?.body).toMatch(/Radio station: prayers are waiting longer than they should\. Open Admin → Radio\./);
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where idempotency_key = 'alert-overdue'`);
  });

  it('call a station that stopped reporting silent, and say nothing outside station mode', async () => {
    await db.query(`update public.station_status set reported_at = now() - interval '30 minutes'`);
    expect(await kinds()).toEqual(['station_silent', 'queue_empty']);
    await as(admin).patch('/admin/radio-settings', { transmitter: 'log' });
    expect(await kinds()).toEqual([]);
  });
});
