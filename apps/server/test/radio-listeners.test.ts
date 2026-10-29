import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import * as signups from '../src/modules/radio/listener-signup.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as qsl from '../src/modules/radio/qsl.js';
import * as radio from '../src/modules/radio/index.js';
import * as receipts from '../src/modules/radio/receipts.js';
import * as setup from '../src/modules/radio/setup.js';
import * as stationReport from '../src/modules/radio/station-report.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const setupDefault = await setup.choice(db);
const signupDefault = await signups.enabled(db);
const cardsDefault = await qsl.enabled(db);
const reportDefault = await stationReport.settings(db);
const reportsDefault = await nodes.enabled(db);
const receiptsDefault = await receipts.enabled(db);
const stationHeaders = { 'x-station-key': STATION_KEY };
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;
const page = (url: string, host?: string) => app.inject({ method: 'GET', url, ...(host ? { headers: { host } } : {}) });

let admin: string;
let operator: string;
let member: string;
beforeAll(async () => {
  admin = await createUser('Listener Admin');
  await grantRole(db, admin, 'admin', null);
  operator = await createUser('Control Operator');
  await grantRole(db, operator, 'radio_operator', admin);
  member = await createUser('Listener Member');
});
afterAll(async () => {
  await signups.setEnabled(db, signupDefault);
  await qsl.setEnabled(db, cardsDefault);
  await stationReport.updateSettings(db, reportDefault);
  await nodes.setEnabled(db, reportsDefault);
  await db.query('update public.token_settings set radio_receipts_enabled = $1', [receiptsDefault]);
  await db.query('update public.token_settings set radio_setup = $1', [setupDefault]);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

/** Join, approve and make a key: the whole path, returning the node and its key. */
async function joinAndMakeKey(name: string, extra: Partial<signups.Signup & { location: string }> = {}) {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${RUN}@example.com`;
  expect((await app.inject({ method: 'POST', url: '/listeners/join', payload: { name, email, receiver: 'rtl-sdr', platform: 'pi', ...extra } })).statusCode).toBe(201);
  const s = (await as(admin).get('/admin/listener-signups')).json().signups.find((x: signups.Signup) => x.email === email);
  const approved = (await as(admin).post(`/admin/listener-signups/${s.id}/approve`)).json();
  const token = approved.setupUrl.split('/').at(-1);
  const made = (await app.inject({ method: 'POST', url: `/listeners/setup/${token}/key` })).json();
  return { signup: s, key: made.key as string, nodeId: made.node.id as string, token };
}

describe('listener sign-up', () => {
  it('is off by default: no page, no sign-ups', async () => {
    expect(signupDefault).toBe(false);
    expect((await page('/listeners')).statusCode).toBe(404);
    expect((await page('/open-circle/listeners')).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/listeners/join', payload: { name: 'Ann', email: 'ann@example.com', receiver: 'radio', platform: 'mac' } })).statusCode).toBe(404);
    expect((await as(admin).get('/admin/listener-signups')).json()).toMatchObject({ enabled: false, emailReady: false });
  });

  it('is for admins only', async () => {
    expect((await as(member).get('/admin/listener-signups')).statusCode).toBe(403);
    expect((await as(operator).patch('/admin/listener-signups', { enabled: true })).statusCode).toBe(403);
  });

  it('shows the page in each edition, Open Circle without religious words', async () => {
    await as(admin).patch('/admin/listener-signups', { enabled: true });
    const pt = await page('/listeners');
    expect(pt.statusCode).toBe(200);
    expect(pt.body).toContain('Become a listener');
    expect(pt.body).toContain('sends prayers over the radio');
    for (const oc of [await page('/open-circle/listeners'), await page('/listeners', 'opencircle.example')]) {
      expect(oc.statusCode).toBe(200);
      expect(oc.body).toContain('sends messages over the radio');
      expect(oc.body).toContain('"open-circle"');
      expect(oc.body).not.toMatch(/pray|prayer|church|god\b|faith|bless/i);
    }
  });

  it('takes a request once per email, and checks what it is given', async () => {
    const email = `dup-${RUN}@example.com`;
    const join = (extra = {}) => app.inject({ method: 'POST', url: '/listeners/join', payload: { name: 'Dup', email, receiver: 'radio', platform: 'mac', ...extra } });
    expect((await join()).statusCode).toBe(201);
    expect((await join({ note: 'again' })).statusCode).toBe(201);
    const mine = (await as(admin).get('/admin/listener-signups')).json().signups.filter((s: signups.Signup) => s.email === email);
    expect(mine).toHaveLength(1);
    expect((await join({ location: 'up the hill' })).statusCode).toBe(400);
    expect((await join({ receiver: 'tv' })).statusCode).toBe(400);
    expect((await join({ callSign: 'K1 ABC' })).statusCode).toBe(400);
  });

  it('approves into a guided setup that makes the key once, places the node and uses up the link', async () => {
    await db.query(`update public.token_settings set radio_setup = $1`, [{ band: 'fm', frequencyHz: 146_520_000 }]);
    const email = `hill-${RUN}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/listeners/join',
      payload: { name: 'Hill Listener', email, place: 'Springfield, IL', location: '39.78, -89.66', receiver: 'rtl-sdr', platform: 'pi', callSign: 'k9abc', edition: 'open-circle' },
    });
    const s = (await as(admin).get('/admin/listener-signups')).json().signups.find((x: signups.Signup) => x.email === email);
    expect(s).toMatchObject({ status: 'pending', lat: 39.8, lon: -89.7, callSign: 'K9ABC', edition: 'open-circle' });
    const approved = (await as(admin).post(`/admin/listener-signups/${s.id}/approve`)).json();
    expect(approved).toMatchObject({ emailed: false, signup: { status: 'approved' } });
    expect(approved.setupUrl).toMatch(/^http:\/\/localhost(:\d+)?\/open-circle\/listeners\/setup\/[A-Za-z0-9_-]{32}$/);
    const path = new URL(approved.setupUrl).pathname;
    const token = path.split('/').at(-1)!;

    const setupPage = await page(path);
    expect(setupPage.statusCode).toBe(200);
    expect(setupPage.headers['cache-control']).toBe('no-store');
    expect(setupPage.body).toContain('Set up your listener, Hill Listener');
    expect(setupPage.body).toContain('get-station.sh | sudo bash -s -- --listener-only --sdr');
    expect(setupPage.body).toContain('LISTEN_SOURCE=rtlsdr\\nLISTEN_SDR_FREQ=146.52M');
    expect(setupPage.body).toContain('NODE_LOCATION=39.8,-89.7,Springfield, IL');
    // Prose only: the install script's address, file and setting names (PrayerTower, prayer-tower-listener, PRAYER_TOWER_API_URL) are the software's own.
    expect(setupPage.body.replace(/PrayerTower|prayer-tower[\w.-]*|PRAYER_TOWER_\w+/g, '')).not.toMatch(/pray/i);

    const made = await app.inject({ method: 'POST', url: `/listeners/setup/${token}/key` });
    expect(made.statusCode).toBe(200);
    expect(made.json().key).toMatch(/^ptn_[0-9a-f]{48}$/);
    expect(made.json().node.name).toBe('Hill Listener, Springfield, IL');
    const { rows } = await db.query('select lat::float8 as lat, lon::float8 as lon, place, edition from public.radio_nodes where id = $1', [made.json().node.id]);
    expect(rows[0]).toEqual({ lat: 39.8, lon: -89.7, place: 'Springfield, IL', edition: 'open-circle' });
    expect((await as(admin).get('/admin/listener-signups')).json().signups.find((x: signups.Signup) => x.id === s.id)).toMatchObject({ status: 'joined', nodeId: made.json().node.id });

    // Used up: the link and the button both stop working, and the key can't be shown again.
    expect((await app.inject({ method: 'POST', url: `/listeners/setup/${token}/key` })).statusCode).toBe(404);
    expect((await page(path)).statusCode).toBe(404);
    expect((await as(admin).post(`/admin/listener-signups/${s.id}/approve`)).statusCode).toBe(409);
    // The key works for the node's own reports.
    expect((await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': made.json().key }, payload: {} })).statusCode).toBe(200);
  });

  it('expires setup links, and a new approval replaces an old link', async () => {
    const email = `late-${RUN}@example.com`;
    await app.inject({ method: 'POST', url: '/listeners/join', payload: { name: 'Late', email, receiver: 'radio', platform: 'mac' } });
    const s = (await as(admin).get('/admin/listener-signups')).json().signups.find((x: signups.Signup) => x.email === email);
    const first = (await as(admin).post(`/admin/listener-signups/${s.id}/approve`)).json().setupUrl.split('/').at(-1);
    const second = (await as(admin).post(`/admin/listener-signups/${s.id}/approve`)).json().setupUrl.split('/').at(-1);
    expect(await signups.bySetupToken(db, first)).toBeNull();
    expect(await signups.bySetupToken(db, second)).not.toBeNull();
    expect(await signups.bySetupToken(db, second, new Date(Date.now() + 15 * 864e5))).toBeNull();
    // A radio (not a dongle) on a Mac: the Mac command, no RTL-SDR lines.
    const mac = await page(`/listeners/setup/${second}`);
    expect(mac.body).toContain('install-mac.sh | bash -s -- --listener-only');
    expect(mac.body).not.toContain('LISTEN_SOURCE=rtlsdr');
    expect(mac.body).toContain('Prayer Tower');
  });

  it('declines and removes requests', async () => {
    const email = `no-${RUN}@example.com`;
    await app.inject({ method: 'POST', url: '/listeners/join', payload: { name: 'No', email, receiver: 'not-sure', platform: 'other' } });
    const s = (await as(admin).get('/admin/listener-signups')).json().signups.find((x: signups.Signup) => x.email === email);
    expect((await as(admin).post(`/admin/listener-signups/${s.id}/decline`)).json().signup.status).toBe('declined');
    expect((await as(admin).delete(`/admin/listener-signups/${s.id}`)).statusCode).toBe(200);
    expect((await as(admin).delete(`/admin/listener-signups/${s.id}`)).statusCode).toBe(404);
  });

  it('writes the setup email in the edition\'s words', () => {
    const s = { name: 'Ann', email: 'ann@example.com', edition: 'open-circle' } as signups.Signup;
    const mail = signups.setupEmail(s, 'Open Circle', 'https://api.example.org/open-circle/listeners/setup/abc');
    expect(mail).toMatchObject({ to: 'ann@example.com', subject: 'Set up your Open Circle listener', secular: true });
    expect(mail.text).toContain('https://api.example.org/open-circle/listeners/setup/abc');
    expect(mail.text + mail.html).not.toMatch(/pray/i);
  });
});

/** A radio prayer the station really sent, and its fingerprint. */
async function airedPrayer(label: string) {
  const text = `${label} ${RUN}.`;
  const post = await newRequest(member, text);
  await as(member).post(`/posts/${post.id}/radio`, { idempotencyKey: `${label}-${RUN}` });
  const batch = (await app.inject({ method: 'POST', url: '/station/claim-batch', headers: stationHeaders, payload: { max: 50 } })).json().radioPrayers as { id: string; text: string }[];
  for (const p of batch) await app.inject({ method: 'POST', url: `/station/radio-prayers/${p.id}/result`, headers: stationHeaders, payload: { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p.text) } });
  return fingerprint(text);
}

describe('thank-you cards', () => {
  let ptNode: { key: string; nodeId: string };
  let ocNode: { key: string; nodeId: string };
  beforeAll(async () => {
    await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
    await tokens.updateSettings(db, { radio_funding: 'free' });
    await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
    await signups.setEnabled(db, true);
    ptNode = await joinAndMakeKey('Card Listener', { place: 'Chatham' });
    ocNode = await joinAndMakeKey('Circle Listener', { edition: 'open-circle' } as never);
  });
  const heard = (key: string, hashes: string[], snrDb = 18.4) =>
    app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': key }, payload: { callSign: CALL, preset: 'fm-standard', snrDb, hashes } });

  it('are off by default: a confirmed report gets no card', async () => {
    expect(cardsDefault).toBe(false);
    await nodes.setEnabled(db, true);
    const res = await heard(ptNode.key, [await airedPrayer('No card yet')]);
    expect(res.json()).toEqual({ matched: 1 });
    expect((await as(member).get('/admin/qsl-cards')).statusCode).toBe(403);
  });

  it('give one card per day per station for confirmed reception, never for unmatched reports', async () => {
    await as(admin).patch('/admin/qsl-cards', { enabled: true });
    expect((await heard(ptNode.key, ['0'.repeat(32)])).json()).toEqual({ matched: 0 });
    const first = (await heard(ptNode.key, [await airedPrayer('Card one')], 12.5)).json();
    expect(first).toMatchObject({ matched: 1, card: { new: true } });
    expect(first.card.path).toMatch(/^\/qsl\/[A-Za-z0-9_-]{24}$/);
    const second = (await heard(ptNode.key, [await airedPrayer('Card two')], 21.3)).json();
    expect(second.card).toEqual({ path: first.card.path, new: false });

    const card = await page(first.card.path);
    expect(card.statusCode).toBe(200);
    expect(card.body).toContain(CALL);
    expect(card.body).toContain('Card Listener, Chatham');
    expect(card.body).toContain('Prayers heard</th><td style="padding:6px 0">2');
    expect(card.body).toContain('21.3 dB SNR');
    expect(card.body).not.toContain(`Card one ${RUN}`);
    const list = (await as(admin).get('/admin/qsl-cards')).json();
    expect(list.cards.find((c: qsl.Card & { path: string }) => c.path === first.card.path)).toMatchObject({ prayers: 2, bestSnrDb: 21.3, callSign: CALL });
  });

  it('use Open Circle words for an Open Circle listener, wherever the card is opened', async () => {
    const r = (await heard(ocNode.key, [await airedPrayer('Circle card')])).json();
    expect(r.card.path).toMatch(/^\/open-circle\/qsl\//);
    for (const url of [r.card.path, r.card.path.replace('/open-circle', '')]) {
      const card = await page(url);
      expect(card.statusCode).toBe(200);
      expect(card.body).toContain('Messages heard');
      expect(card.body).not.toMatch(/pray|church|god\b|faith|bless/i);
    }
  });

  it('are hidden while switched off, and unknown links are not found', async () => {
    const r = (await heard(ptNode.key, [await airedPrayer('Card three')])).json();
    expect((await page('/qsl/not-a-real-card-token-123')).statusCode).toBe(404);
    await qsl.setEnabled(db, false);
    expect((await page(r.card.path)).statusCode).toBe(404);
    await qsl.setEnabled(db, true);
  });

  it('email a new card in the edition\'s words', () => {
    const c = { node: 'Circle Listener', callSign: 'K1ABC', day: '2026-10-29', edition: 'open-circle' } as qsl.Card;
    const mail = qsl.cardEmail(c, 'a@example.com', 'Open Circle', 'https://api.example.org/open-circle/qsl/x');
    expect(mail).toMatchObject({ subject: 'Your thank-you card from K1ABC', secular: true });
    expect(mail.text + mail.html).not.toMatch(/pray/i);
  });
});

describe('weekly station report', () => {
  it('is off by default and shows nothing', async () => {
    expect(reportDefault).toEqual({ enabled: false, email: false });
    expect((await as(operator).get('/admin/station-report')).json()).toEqual({ enabled: false, email: false, thisWeek: null, lastWeek: null, history: [] });
    expect(await stationReport.runWeekly(db, async () => {})).toEqual({ week: null, emailed: 0 });
  });

  it('is read by admins and radio operators; only admins switch it', async () => {
    expect((await as(member).get('/admin/station-report')).statusCode).toBe(403);
    expect((await as(operator).patch('/admin/station-report', { enabled: true })).statusCode).toBe(403);
  });

  it('counts bursts, prayers, listeners and problems for the week', async () => {
    const before = (await as(admin).patch('/admin/station-report', { enabled: true })).json().thisWeek as stationReport.StationReport;
    const burst = (ok: boolean, error?: string) =>
      app.inject({ method: 'POST', url: '/station/bursts', headers: stationHeaders, payload: { callSign: CALL, mode: 'audio', preset: 'fm-standard', prayers: 3, frames: 1, bytes: 90, seconds: 6.5, ok, ...(error ? { error } : {}) } });
    await burst(true);
    await burst(true);
    await burst(false, 'PTT did not key');
    await db.query(`insert into public.radio_alert_history (kind, call_sign, detail) values ('ptt_failed', $1, 'test')`, [CALL]);
    const node = await joinAndMakeKey('Report Listener');
    await app.inject({ method: 'POST', url: '/node/channel-report', headers: { 'x-node-key': node.key }, payload: { callSign: CALL, preset: 'fm-standard', snrDb: 14 } });
    await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': node.key }, payload: { callSign: CALL, preset: 'fm-standard', snrDb: 14, hashes: [await airedPrayer('Report prayer')] } });

    const now = (await as(operator).get('/admin/station-report')).json();
    const r = now.thisWeek as stationReport.StationReport;
    expect(now.lastWeek.weekStart).toBe(new Date(new Date(r.weekStart).getTime() - 7 * 864e5).toISOString().slice(0, 10));
    expect(r.bursts.sent - before.bursts.sent).toBe(2);
    expect(r.bursts.failed - before.bursts.failed).toBe(1);
    expect(r.bursts.airSeconds - before.bursts.airSeconds).toBeGreaterThanOrEqual(12);
    expect(r.prayers.delivered - before.prayers.delivered).toBeGreaterThanOrEqual(1);
    expect(r.prayers.heard - before.prayers.heard).toBeGreaterThanOrEqual(1);
    expect((r.problems.byKind.ptt_failed ?? 0) - (before.problems.byKind.ptt_failed ?? 0)).toBe(1);
    expect(r.problems.burstErrors).toContainEqual(expect.objectContaining({ error: 'PTT did not key' }));
    expect(r.listeners.perNode.find((n) => n.name === 'Report Listener')).toMatchObject({ reports: 1, snrDb: 14, quality: 'fair', receiver: null });
    expect(r.listeners.joined - before.listeners.joined).toBeGreaterThanOrEqual(1);
  });

  it('emails last week to admins and radio operators once, with no request text', async () => {
    await stationReport.updateSettings(db, { email: true });
    const sent: Mail[] = [];
    const nextWeek = new Date(Date.now() + 7 * 864e5);
    const thisWeek = stationReport.weekStartOf(new Date()).toISOString().slice(0, 10);
    await db.query('delete from public.station_reports where week_start = $1', [thisWeek]);
    const r = await stationReport.runWeekly(db, async (m) => void sent.push(m), nextWeek);
    expect(r.week).toBe(thisWeek);
    expect(r.emailed).toBeGreaterThanOrEqual(2);
    expect(sent.map((m) => m.to)).toEqual(expect.arrayContaining([`${admin}@test.local`, `${operator}@test.local`]));
    expect(sent[0]!.subject).toBe(`Station report, week of ${thisWeek}`);
    expect(sent[0]!.text).toContain('Bursts sent:');
    expect(sent[0]!.html).not.toContain(`Report prayer ${RUN}`);
    expect((await stationReport.runWeekly(db, async (m) => void sent.push(m), nextWeek)).emailed).toBe(0);
  });

  it('starts weeks on Monday, UTC', () => {
    expect(stationReport.weekStartOf(new Date('2026-11-01T23:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(stationReport.weekStartOf(new Date('2026-10-26T00:00:00Z')).toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });
});
