// The prayer panel: off by default; an SSTV station's claims wait for the switch; members get
// the latest prayers to draw a panel from; the listener apps are told to offer panel reading.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as panel from '../src/modules/radio/panel.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const panelDefault = await panel.enabled(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const RUN = Math.random().toString(36).slice(2, 7);

let admin: string;
let member: string;
beforeAll(async () => {
  admin = await createUser('Panel Admin');
  await grantRole(db, admin, 'admin', null);
  member = await createUser('Panel Member');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await panel.setEnabled(db, panelDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

describe('prayer panel', () => {
  it('is off by default: SSTV claims wait, members get nothing, listeners are not offered it', async () => {
    expect(panelDefault).toBe(false);
    expect((await station('/station/claim-batch', { max: 10, mode: 'panel' })).statusCode).toBe(409);
    expect((await as(member).get('/radio/panel')).statusCode).toBe(404);
    expect((await as(member).get('/features')).json().features.radioPanel).toBe(false);
    expect((await as(member).patch('/admin/radio-panel', { enabled: true })).statusCode).toBe(403);
  });

  it('switched on: the station sends panels, members get the latest prayers to draw one, listeners may read them', async () => {
    expect((await as(admin).patch('/admin/radio-panel', { enabled: true })).json()).toEqual({ enabled: true });
    const post = await newRequest(member, `Pray for the harvest, and call 217-555-0123. ${RUN}`);
    await as(member).post(`/posts/${post.id}/radio`, { idempotencyKey: `panel-${RUN}` });
    const claimed = (await station('/station/claim-batch', { max: 10, mode: 'panel' })).json().radioPrayers as { id: string; text: string }[];
    const mine = claimed.find((c) => c.text.endsWith(RUN))!;
    expect(mine.text).toBe(`Pray for the harvest, and call. ${RUN}`);
    await station(`/station/radio-prayers/${mine.id}/result`, { ok: true, callSign: 'N0CALL', preset: 'sstv-robot36', sentHash: '0'.repeat(32) });
    const p = (await as(member).get('/radio/panel')).json();
    expect(p.callSign).toBe('N0CALL');
    // Newest first; other tests share the database, so only that it's there.
    expect(p.prayers).toContain(mine.text);
    expect((await as(member).get('/features')).json().features.radioPanel).toBe(true);
    await radio.updateStationSettings(db, { listen_page_enabled: true });
    expect((await as(member).get('/radio/listen')).json().panel).toBe(true);
  });
});
