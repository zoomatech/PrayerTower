// Regression pass: every radio feature with every switch on, for a Prayer Tower
// member and an Open Circle member side by side. Open Circle members must never
// read religious words from the radio features (their own request text aside).
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as acks from '../src/modules/radio/acks.js';
import * as health from '../src/modules/radio/health.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as oplog from '../src/modules/radio/oplog.js';
import * as prayingToo from '../src/modules/radio/praying-too.js';
import * as radio from '../src/modules/radio/index.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as setup from '../src/modules/radio/setup.js';
import * as coverage from '../src/modules/radio/coverage.js';
import * as digest from '../src/modules/radio/digest.js';
import * as thanks from '../src/modules/radio/thanksgiving.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church|pastors?|priestly|scripture|blessed|amen)\b/i;
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const node = (url: string, key: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-node-key': key }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

const defaults = {
  station: await radio.stationSettings(db),
  tokens: await tokens.settings(db),
  acks: await acks.settings(db),
  schedule: await schedule.get(db),
  health: await health.settings(db),
  page: await health.pageEnabled(db),
  listener: await nodes.enabled(db),
  multi: await nodes.multiStation(db),
  oplog: await oplog.enabled(db),
  thanks: await thanks.enabled(db),
  praying: await prayingToo.enabled(db),
  wizard: await setup.enabled(db),
  coverage: await coverage.settings(db),
  digest: await digest.settings(db),
};

let admin: string;
const people = { faith: { poster: '', sender: '' }, oc: { poster: '', sender: '' } };
let listenerKey: string;
beforeAll(async () => {
  admin = await createUser('Regression Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/communities/open-circle', { status: 'active' });
  for (const k of ['faith', 'oc'] as const) {
    people[k].poster = await createUser(`Regression ${k} poster`);
    people[k].sender = await createUser(`Regression ${k} sender`);
    if (k === 'oc') for (const id of Object.values(people.oc)) await as(id).post('/me/community', { slug: 'open-circle' });
  }
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.query(`update public.radio_prayers set heard_retries = 10 where status = 'transmitted' and heard_at is null`);
  // Every radio switch on.
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'need', batchMax: 50, listenPage: true, receipts: true, onAirPage: true });
  await as(admin).patch('/admin/radio-alerts', { enabled: true });
  await as(admin).patch('/admin/radio-health', { enabled: true, acks: { enabled: true, timeoutMinutes: 5, maxRetries: 1 } });
  await as(admin).patch('/admin/radio-nodes', { enabled: true, multiStation: true });
  await as(admin).patch('/admin/radio-schedule', { enabled: true, timeZone: 'UTC', windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '00:00' }], quietStart: null, quietEnd: null });
  await as(admin).patch('/admin/operator-log', { enabled: true });
  await as(admin).patch('/admin/listener-mode', { enabled: true });
  await as(admin).patch('/admin/radio-followups', { thanksgiving: true, prayingToo: true });
  await as(admin).patch('/admin/radio-setup', { enabled: true });
  await as(admin).patch('/admin/radio-coverage', { enabled: true });
  await as(admin).patch('/admin/radio-digest', { enabled: true });
  await db.query(`update public.radio_setup_tests set status = 'failed', error = 'test reset' where status in ('requested', 'sending', 'sent')`);
  listenerKey = (await as(admin).post('/admin/radio-nodes', { name: `Regression listener ${RUN}` })).json().key;
});
afterAll(async () => {
  await radio.updateStationSettings(db, defaults.station);
  await tokens.updateSettings(db, defaults.tokens);
  await acks.updateSettings(db, defaults.acks);
  await schedule.update(db, defaults.schedule);
  await health.updateSettings(db, { enabled: defaults.health.station_alerts_enabled, overdueMinutes: defaults.health.station_overdue_minutes });
  await health.setPageEnabled(db, defaults.page);
  await nodes.setEnabled(db, defaults.listener);
  await nodes.setMultiStation(db, defaults.multi);
  await oplog.setEnabled(db, defaults.oplog);
  await thanks.setEnabled(db, defaults.thanks);
  await prayingToo.setEnabled(db, defaults.praying);
  await setup.setEnabled(db, defaults.wizard);
  await coverage.updateSettings(db, { enabled: defaults.coverage.enabled, tileUrl: defaults.coverage.tileUrl, station: defaults.coverage.station });
  await digest.updateSettings(db, defaults.digest);
  await db.query('update public.token_settings set listener_mode_enabled = false');
  await db.query(`update public.communities set status = 'hidden', hidden_features = '{}' where slug = 'open-circle'`);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

type Claimed = { id: string; text: string };
async function sendAll(): Promise<Claimed[]> {
  const res = await station('/station/claim-batch', { max: 50 });
  expect([200, 204]).toContain(res.statusCode);
  const list: Claimed[] = res.statusCode === 200 ? res.json().radioPrayers : [];
  for (const p of list) {
    const r = await station(`/station/radio-prayers/${p.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p.text), frequencyHz: 146_520_000, pieces: 1 });
    expect(r.statusCode).toBe(200);
  }
  return list;
}

describe('every radio feature, every switch on, both editions', () => {
  it('a request goes out, is heard, gets "praying too", is answered and thanked on the air', async () => {
    await node('/node/heartbeat', listenerKey);
    const texts = { faith: `Healing for my mother ${RUN}.`, oc: `Strength for my job search ${RUN}.` };
    const posts: Record<string, string> = {};
    for (const k of ['faith', 'oc'] as const) {
      const p = await as(people[k].poster).post('/posts', { postType: 'prayer_request', body: texts[k] });
      expect(p.statusCode).toBe(201);
      posts[k] = p.json().post.id;
      const q = await as(people[k].sender).post(`/posts/${posts[k]}/radio`, { idempotencyKey: `reg-${RUN}-${k}` });
      expect(q.statusCode).toBe(201);
    }
    const first = await sendAll();
    expect(first.map((p) => p.text).sort()).toEqual([texts.faith, texts.oc].sort());

    // A listener node hears both, and a listener taps "I'm praying too" on each.
    expect((await node('/node/heard', listenerKey, { callSign: CALL, preset: 'fm-standard', snrDb: 14, hashes: first.map((p) => fingerprint(p.text)) })).json()).toEqual({ matched: 2 });
    await node('/node/channel-report', listenerKey, { callSign: CALL, preset: 'fm-standard', snrDb: 14 });
    expect((await app.inject({ method: 'POST', url: '/listen/praying', payload: { callSign: CALL, hashes: first.map((p) => fingerprint(p.text)) } })).json()).toEqual({ matched: 2 });

    // Both posters mark answered: one thanksgiving each, in their own wording.
    for (const k of ['faith', 'oc'] as const) expect((await as(people[k].poster).post(`/posts/${posts[k]}/answered`)).statusCode).toBe(200);
    const thanksSent = await sendAll();
    expect(thanksSent.map((p) => p.text).sort()).toEqual([`Answered! Thank you for praying: ${texts.faith}`, `Good news, answered. Thank you for your support: ${texts.oc}`].sort());

    // Heard prayers are never resent; nothing else is waiting.
    await db.query(`update public.radio_prayers set transmitted_at = now() - interval '10 minutes' where id = any($1::uuid[])`, [first.map((p) => p.id)]);
    expect(await sendAll()).toEqual([]);

    // Open Circle members read no religious words in any radio notice.
    for (const id of Object.values(people.oc)) {
      const notes = (await as(id).get('/me/notifications')).json().notifications as { kind: string; title: string; body: string }[];
      const radioNotes = notes.filter((n) => n.kind.startsWith('radio'));
      expect(radioNotes.length).toBeGreaterThan(0);
      for (const n of radioNotes) expect(`${n.title} ${n.body}`).not.toMatch(RELIGIOUS);
    }
    const ocKinds = ((await as(people.oc.poster).get('/me/notifications')).json().notifications as { kind: string }[]).map((n) => n.kind);
    expect(ocKinds).toEqual(expect.arrayContaining(['radio_on_air', 'radio_heard', 'radio_praying_too']));
    // Prayer Tower members keep the faith wording.
    const faithNotes = (await as(people.faith.poster).get('/me/notifications')).json().notifications as { kind: string; title: string }[];
    expect(faithNotes.find((n) => n.kind === 'radio_praying_too')?.title).toBe('Someone who heard your request on the radio is praying too');

    // Each edition's cast log shows only its own community, thanksgiving included.
    const ocCast = (await as(people.oc.sender).get('/prayer-cast')).json().cast as { text: string }[];
    expect(ocCast.map((c) => c.text)).toEqual(expect.arrayContaining([texts.oc, `Good news, answered. Thank you for your support: ${texts.oc}`]));
    expect(ocCast.some((c) => c.text.includes(texts.faith))).toBe(false);
  });

  it('the admin views all work together: health, alerts, nodes, schedule, operator log', async () => {
    await station('/station/status', { callSign: CALL, checks: [{ name: 'audio', ok: true, detail: '' }] });
    const h = (await as(admin).get('/admin/radio-health')).json();
    expect(h.health.stations.find((s: { callSign: string }) => s.callSign === CALL)).toMatchObject({ silent: false });
    expect(h.health.snr).toContainEqual(expect.objectContaining({ callSign: CALL, preset: 'fm-standard' }));
    expect(h.acks.heard).toBeGreaterThanOrEqual(2);
    expect((await as(admin).get('/admin/radio-alerts')).json().enabled).toBe(true);
    expect((await as(admin).get('/admin/radio-schedule')).json().onAirNow).toBe(true);
    const nodesView = (await as(admin).get('/admin/radio-nodes')).json();
    expect(nodesView).toMatchObject({ enabled: true, multiStation: true });
    const csv = (await as(admin).get('/admin/operator-log?format=csv')).body;
    const mine = csv.split('\n').filter((l) => l.includes(CALL));
    expect(mine).toHaveLength(4);
    for (const l of mine) expect(l).toContain(',146520000,fm-standard,1,transmitted,');
  });

  it('the setup wizard, coverage map and weekly digest work alongside everything else', async () => {
    // A test burst heard by the listener is a test, never a prayer: no receipts, no resend.
    const t = (await as(admin).post('/admin/radio-setup/tests', { kind: 'burst' })).json().test;
    const claimed = await app.inject({ method: 'GET', url: `/station/setup-test?callSign=${CALL}`, headers: { 'x-station-key': STATION_KEY } });
    expect(claimed.json().test.id).toBe(t.id);
    const hash = fingerprint(`Station test ${t.code}`);
    await station(`/station/setup-test/${t.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: hash });
    expect((await node('/node/heard', listenerKey, { callSign: CALL, preset: 'fm-standard', snrDb: 22, hashes: [hash], peakDbfs: -8 })).json()).toEqual({ matched: 1 });
    expect((await as(admin).get('/admin/radio-setup')).json().tests[0]).toMatchObject({ id: t.id, status: 'heard', advice: 'good' });
    expect(await sendAll()).toEqual([]);

    // The listener opts in to the map; its earlier report colors its dot.
    await node('/node/heartbeat', listenerKey, { location: { lat: 39.78, lon: -89.66, place: 'Springfield' } });
    const map = (await as(admin).get('/admin/radio-coverage')).json();
    expect(map.points.find((p: { name: string }) => p.name === `Regression listener ${RUN}`)).toMatchObject({ lat: 39.8, lon: -89.7, quality: 'fair' });

    // The digest counts this week's prayers (thanksgiving apart) and holds no request text.
    const week = (await as(admin).get('/admin/radio-digest')).json().weeks.at(-1);
    expect(week.aired).toBeGreaterThanOrEqual(2);
    expect(week.heard).toBeGreaterThanOrEqual(2);
    expect(week.thanksgiving).toBeGreaterThanOrEqual(2);
    expect(digest.toText(week)).not.toContain(RUN);
  });

  it('public pages and the signed-out listener mode, with Open Circle wording on its host and path', async () => {
    expect((await app.inject({ method: 'GET', url: '/listen/config' })).json()).toEqual({ enabled: true, receipts: true, prayingToo: true });
    const pt = await app.inject({ method: 'GET', url: '/listen' });
    expect(pt.statusCode).toBe(200);
    expect(pt.body).toContain('Listen to a prayer burst');
    // Microphone capture on the audio thread, and the packet fallback's cards.
    expect(pt.body).toContain('audioWorklet.addModule');
    expect(pt.body).toContain('PTDecoder.decodePackets');
    for (const [url, host] of [['/listen', 'opencircle.example'], ['/open-circle/listen', 'localhost'], ['/on-the-air', 'opencircle.example'], ['/open-circle/on-the-air', 'localhost']] as const) {
      const res = await app.inject({ method: 'GET', url, headers: { host } });
      expect(res.statusCode, url).toBe(200);
      // The page without its decoder script (code, not words a visitor reads). A test check, not a sanitizer.
      const text = res.body
        .split('<script')
        .map((part, i) => (i ? part.slice(part.indexOf('</script>') + '</script>'.length) : part))
        .join(' ');
      expect(text, `${host}${url}`).not.toMatch(RELIGIOUS);
      if (url.endsWith('/listen')) expect(text).toContain('Listen to a radio burst');
      if (url.endsWith('/listen')) expect(res.body).toContain("const ITEMS = ' message(s)';");
    }
  });
});
