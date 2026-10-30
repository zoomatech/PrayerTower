// Closing the loop for members ("Sent by radio, heard by N listeners", one opt-in notice), the
// Listen screen's read-aloud switch, and an end-to-end check that nothing private goes into a burst.
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as followup from '../src/modules/radio/followup.js';
import * as radio from '../src/modules/radio/index.js';
import { scrubContact, scrubNames } from '../src/modules/radio/privacy.js';
import * as trail from '../src/modules/radio/trail.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const trailDefault = await trail.enabled(db);
const loopDefaults = await followup.loopSettings(db);
const { rows: saved } = await db.query<{ receipts: boolean; coverage: boolean; lat: string | null; lon: string | null }>(
  'select radio_receipts_enabled as receipts, coverage_map_enabled as coverage, radio_station_lat as lat, radio_station_lon as lon from public.token_settings',
);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const node = (url: string, key: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-node-key': key }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;

let admin: string;
let sender: string;
let poster: string;
let stranger: string;
beforeAll(async () => {
  admin = await createUser('Loop Admin');
  await grantRole(db, admin, 'admin', null);
  sender = await createUser('Loop Sender');
  poster = await createUser('Margaret Loopwell');
  stranger = await createUser('Loop Stranger');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await db.query('update public.token_settings set radio_receipts_enabled = true');
});
afterAll(async () => {
  await followup.updateLoopSettings(db, loopDefaults);
  await trail.setEnabled(db, trailDefault);
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  const s = saved[0]!;
  await db.query('update public.token_settings set radio_receipts_enabled = $1, coverage_map_enabled = $2, radio_station_lat = $3, radio_station_lon = $4', [s.receipts, s.coverage, s.lat, s.lon]);
  await db.end();
});

/** Queue a request by radio and let the station claim it: the words that went into the burst. */
async function claim(by: string, postId: string, key: string) {
  const res = await as(by).post(`/posts/${postId}/radio`, { idempotencyKey: `${key}-${RUN}` });
  if (res.statusCode >= 300) return { status: res.statusCode, text: null };
  const claimed = (await station('/station/claim-batch', { max: 50 })).json().radioPrayers as { id: string; text: string }[];
  const mine = claimed.find((c) => c.id === res.json().radioPrayer.id);
  return { status: res.statusCode, id: mine?.id, text: mine?.text ?? null };
}

describe('privacy rules for the words on the air', () => {
  it('takes out email addresses, links, phone numbers and handles, never a verse', () => {
    expect(scrubContact('Pray for us, write to ann.lee+p@example.org or call (555) 867-5309 / +1 217 555 0100, see https://x.example/a?b=1 and www.example.com, thanks @annlee! John 3:16-18.'))
      .toBe('Pray for us, write to or call /, see and, thanks! John 3:16-18.');
  });

  it('replaces names with "someone", once per person, keeping everyday and faith words', () => {
    expect(scrubNames('Please pray for my friend John Smith’s surgery on Tuesday with Dr. Patel, and for Mom. Lord, give Grace peace.', [], true))
      .toBe('Please pray for my friend someone’s surgery on Tuesday with Dr. someone, and for Mom. Lord, give someone peace.');
    // Without guessing, only the author's own name and handle go.
    expect(scrubNames('Margaret here: pray for Margaret and Tom, from margaret_l.', ['Margaret Loopwell', 'margaret_l'], false)).toBe('someone here: pray for someone and Tom, from someone.');
  });
});

describe('closing the loop for members', () => {
  it('is off by default; then shows when it went out, how many heard, and where, to the sender and the asker only', async () => {
    expect(loopDefaults).toEqual({ followup: false, readAloud: false, namePrivacy: false });
    expect((await as(sender).get('/features')).json().features.radioFollowup).toBe(false);
    const post = await newRequest(poster, `Pray for the night shift at the mill. ${RUN}`);
    expect((await as(sender).get(`/posts/${post.id}/radio-summary`)).statusCode).toBe(404);
    expect((await as(sender).patch('/admin/radio-loop', { followup: true })).statusCode).toBe(403);
    expect((await as(admin).patch('/admin/radio-loop', { followup: true })).json()).toMatchObject({ followup: true });
    await trail.setEnabled(db, true);
    await as(admin).patch('/admin/radio-coverage', { enabled: true, station: { lat: 39.78, lon: -89.66 } });

    expect((await as(sender).get(`/posts/${post.id}/radio-summary`)).json()).toMatchObject({ latest: null, sends: 0 });
    const c = await claim(sender, post.id, 'loop');
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(c.text!) });
    const hill = (await as(admin).post('/admin/radio-nodes', { name: `Hill ${RUN}` })).json();
    const cellar = (await as(admin).post('/admin/radio-nodes', { name: `Cellar ${RUN}` })).json();
    await as(admin).put(`/admin/radio-nodes/${hill.node.id}/location`, { location: { lat: 39.84, lon: -89.53 } });
    const report = { callSign: CALL, preset: 'fm-standard', hashes: [fingerprint(c.text!)] };
    await node('/node/heard', hill.key, { ...report, snrDb: 12.3 });
    await node('/node/heard', hill.key, { ...report, snrDb: 15.1 });
    await node('/node/heard', cellar.key, { ...report, snrDb: 4 });
    await app.inject({ method: 'POST', url: '/listen/heard', payload: { ...report, snrDb: 7 } });

    const s = (await as(sender).get(`/posts/${post.id}/radio-summary`)).json();
    // Hilltop once (two reports), the unplaced cellar node, one phone: three listeners, one place on the map.
    expect(s).toMatchObject({ optedIn: false, sends: 1, station: { lat: 39.8, lon: -89.7 }, latest: { callSign: CALL, heardBy: 3, places: [{ name: `Hill ${RUN}`, lat: 39.8, lon: -89.5, snrDb: 15.1 }] } });
    expect((await as(poster).get(`/posts/${post.id}/radio-summary`)).json().latest.heardBy).toBe(3);
    expect((await as(stranger).get(`/posts/${post.id}/radio-summary`)).json()).toMatchObject({ latest: null, sends: 0 });
    expect((await as(sender).get('/features')).json().features.radioFollowup).toBe(true);

    // One gentle notice, only to those who opted in, once the reports are in.
    expect((await as(sender).get('/me/radio-prefs')).json()).toEqual({ followup: false, namesPrivate: null });
    expect((await as(sender).patch('/me/radio-prefs', { namesPrivate: true })).statusCode).toBe(400);
    expect((await as(sender).patch('/me/radio-prefs', { followup: true })).json()).toEqual({ followup: true, namesPrivate: null });
    expect(await followup.sendDue(db)).toBe(0);
    await db.query(`update public.radio_prayers set transmitted_at = now() - interval '40 minutes' where id = $1`, [c.id]);
    expect(await followup.sendDue(db)).toBe(1);
    expect(await followup.sendDue(db)).toBe(0);
    const { rows } = await db.query<{ user_id: string; title: string; body: string }>(`select user_id, title, body from public.notifications where kind = 'radio_followup' and data ->> 'radioPrayerId' = $1`, [c.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: sender, title: 'Your prayer went out by radio' });
    expect(rows[0]!.body).toMatch(/^Sent at .+, heard by 3 listeners\.$/);
  });

  it('says so gently when no listener has reported it', () => {
    expect(followup.noticeBody('9:30 PM CDT', 0)).toBe('Sent at 9:30 PM CDT. No listener has reported it yet.');
    expect(followup.noticeBody('9:30 PM CDT', 1)).toBe('Sent at 9:30 PM CDT, heard by 1 listener.');
  });

  it('offers reading aloud on the Listen screen only while that switch is on', async () => {
    await radio.updateStationSettings(db, { listen_page_enabled: true });
    expect((await as(sender).get('/radio/listen')).json().readAloud).toBe(false);
    await as(admin).patch('/admin/radio-loop', { readAloud: true });
    expect((await as(sender).get('/radio/listen')).json().readAloud).toBe(true);
  });
});

describe('end to end: nothing private goes into a burst', () => {
  it('contact details never, sensitive requests and laments never, a confession only from its author', async () => {
    const contact = await newRequest(poster, `Pray for my job hunt, email me at margaret@example.org or call 217-555-0199. ${RUN}`);
    const c = await claim(sender, contact.id, 'contact');
    expect(c.text).toBe(`Pray for my job hunt, email me at or call. ${RUN}`);
    // The cast log shows exactly what went out.
    await station(`/station/radio-prayers/${c.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(c.text!) });
    const cast = (await as(stranger).get('/prayer-cast')).json().cast as { id: string; text: string }[];
    expect(cast.find((x) => x.id === c.id)?.text).toBe(c.text);

    const sensitive = await newRequest(poster, `A private matter. ${RUN}`, { isSensitive: true });
    expect((await claim(sender, sensitive.id, 'sensitive')).status).toBe(409);
    const confession = (await as(poster).post('/posts', { postType: 'confessional', body: `I confess I was unkind to my brother. ${RUN}` })).json().post;
    expect((await claim(sender, confession.id, 'confess-other')).status).toBe(409);
    expect((await claim(poster, confession.id, 'confess-own')).text).toBe(`I confess I was unkind to my brother. ${RUN}`);
  });

  it('an anonymous request never carries its author’s name; with name privacy on, a member who chose it carries no names', async () => {
    const anon = await newRequest(poster, `Margaret asks: pray for Tom at the clinic. ${RUN}`, { isAnonymous: true });
    expect((await claim(sender, anon.id, 'anon')).text).toBe(`someone asks: pray for Tom at the clinic. ${RUN}`);

    const named = `Pray for Tom Baker’s heart surgery at Memorial with Dr. Okafor. ${RUN}`;
    const open = await newRequest(poster, named);
    expect((await claim(sender, open.id, 'open')).text).toBe(named);

    await as(admin).patch('/admin/radio-loop', { namePrivacy: true });
    expect((await as(poster).patch('/me/radio-prefs', { namesPrivate: true })).json()).toMatchObject({ namesPrivate: true });
    const priv = await newRequest(poster, `Again: ${named}`);
    expect((await claim(sender, priv.id, 'private')).text).toBe(`Again: Pray for someone’s heart surgery at someone with Dr. someone. ${RUN}`);
    const anon2 = await newRequest(poster, `Pray for Tom and Ruth. ${RUN}`, { isAnonymous: true });
    expect((await claim(sender, anon2.id, 'anon2')).text).toBe(`Pray for someone and someone. ${RUN}`);
  });
});
