import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as prayingToo from '../src/modules/radio/praying-too.js';
import * as radio from '../src/modules/radio/index.js';
import * as thanks from '../src/modules/radio/thanksgiving.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, newRequest, STATION_KEY } from './helpers.js';

const stationDefaults = await radio.stationSettings(db);
const tokenDefaults = await tokens.settings(db);
const thanksDefault = await thanks.enabled(db);
const prayingDefault = await prayingToo.enabled(db);
const station = (url: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-station-key': STATION_KEY }, payload: body });
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;
type Claimed = { id: string; text: string };

let admin: string;
let poster: string;
let sender: string;
beforeAll(async () => {
  admin = await createUser('Followup Admin');
  await grantRole(db, admin, 'admin', null);
  poster = await createUser('Followup Poster');
  sender = await createUser('Followup Sender');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 50 });
  await tokens.updateSettings(db, { radio_funding: 'free' });
});
afterAll(async () => {
  await radio.updateStationSettings(db, stationDefaults);
  await tokens.updateSettings(db, tokenDefaults);
  await thanks.setEnabled(db, thanksDefault);
  await prayingToo.setEnabled(db, prayingDefault);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await db.end();
});

async function sendAll(): Promise<Claimed[]> {
  const res = await station('/station/claim-batch', { max: 50 });
  const list: Claimed[] = res.statusCode === 200 ? res.json().radioPrayers : [];
  for (const p of list) await station(`/station/radio-prayers/${p.id}/result`, { ok: true, callSign: CALL, preset: 'fm-standard', sentHash: fingerprint(p.text) });
  return list;
}
let n = 0;
async function radioRequest(text: string) {
  const post = await newRequest(poster, text);
  await as(sender).post(`/posts/${post.id}/radio`, { idempotencyKey: `follow-${RUN}-${n++}` });
  return post;
}

describe('thanksgiving on the air for answered requests', () => {
  it('words it with no religious words for Open Circle, and keeps it short', () => {
    expect(thanks.thanksText('Pray  for my\nmom ', false)).toBe('Answered! Thank you for praying: Pray for my mom');
    expect(thanks.thanksText('My job interview', true)).toBe('Good news, answered. Thank you for your support: My job interview');
    const long = thanks.thanksText('x'.repeat(400), false);
    expect(long.length).toBe(160);
    expect(long.endsWith('...')).toBe(true);
  });

  it('is off by default: marking answered queues nothing', async () => {
    expect(thanksDefault).toBe(false);
    const post = await radioRequest(`Off switch request ${RUN}.`);
    await sendAll();
    await as(poster).post(`/posts/${post.id}/answered`);
    expect(await sendAll()).toEqual([]);
  });

  it('queues one free thanksgiving for a request that went out, and none for one that never did', async () => {
    expect((await as(admin).patch('/admin/radio-followups', { thanksgiving: true })).json()).toMatchObject({ thanksgiving: true });
    const aired = await radioRequest(`Healing for Jo after surgery ${RUN}.`);
    await sendAll();
    const quiet = await newRequest(poster, `Never aired ${RUN}.`);
    await as(poster).post(`/posts/${aired.id}/answered`);
    await as(poster).post(`/posts/${quiet.id}/answered`);
    const sent = await sendAll();
    expect(sent.map((p) => p.text)).toEqual([`Answered! Thank you for praying: Healing for Jo after surgery ${RUN}.`]);
    const { rows } = await db.query<{ cost: number; kind: string; user_id: string; funded_by: string }>(
      `select cost, kind, user_id, funded_by from public.radio_prayers where id = $1`,
      [sent[0]!.id],
    );
    expect(rows[0]).toEqual({ cost: 0, kind: 'thanksgiving', user_id: poster, funded_by: 'free' });
    // Once per request.
    expect(await thanks.onAnswered(db, aired.id)).toBeNull();
    // The cast log shows what went out.
    const cast = (await as(poster).get('/prayer-cast')).json().cast as { text: string }[];
    expect(cast.some((c) => c.text.startsWith('Answered! Thank you for praying: Healing for Jo'))).toBe(true);
  });

  it("the poster's own free radio send and the thanksgiving don't block each other", async () => {
    const post = await newRequest(poster, `Poster sends it herself ${RUN}.`);
    expect((await as(poster).post(`/posts/${post.id}/radio`, { idempotencyKey: `own-${RUN}` })).statusCode).toBe(201);
    await sendAll();
    await as(poster).post(`/posts/${post.id}/answered`);
    expect((await sendAll()).map((p) => p.text)).toEqual([`Answered! Thank you for praying: Poster sends it herself ${RUN}.`]);
  });
});

describe("listeners' I'm praying too", () => {
  it('is off by default (404), then counts anonymous taps by fingerprint and tells the asker once', async () => {
    expect(prayingDefault).toBe(false);
    const post = await radioRequest(`Peace for the Ruiz family ${RUN}.`);
    const [p] = await sendAll();
    const tap = () => app.inject({ method: 'POST', url: '/listen/praying', payload: { callSign: CALL.toLowerCase(), hashes: [fingerprint(p!.text)] } });
    expect((await tap()).statusCode).toBe(404);
    await as(admin).patch('/admin/radio-followups', { prayingToo: true });
    await as(admin).patch('/admin/radio-settings', { listenPage: true });
    expect((await as(sender).get('/radio/listen')).json()).toMatchObject({ prayingToo: true });
    expect((await tap()).json()).toEqual({ matched: 1 });
    expect((await tap()).json()).toEqual({ matched: 1 });
    const { rows } = await db.query<{ listener_praying: number }>('select listener_praying from public.radio_prayers where id = $1', [p!.id]);
    expect(rows[0]!.listener_praying).toBe(2);
    const { rows: notes } = await db.query<{ count: number }>(
      `select count(*)::int as count from public.notifications where user_id = $1 and kind = 'radio_praying_too' and data ->> 'postId' = $2`,
      [poster, post.id],
    );
    expect(notes[0]!.count).toBe(1);
    // Another station's call sign, or an unknown fingerprint, matches nothing; bad input is refused.
    expect((await app.inject({ method: 'POST', url: '/listen/praying', payload: { callSign: 'W9ZZZ', hashes: [fingerprint(p!.text)] } })).json()).toEqual({ matched: 0 });
    expect((await app.inject({ method: 'POST', url: '/listen/praying', payload: { callSign: CALL, hashes: ['nothex'] } })).statusCode).toBe(400);
  });
});
