// The station end to end in practice mode (docs/STATION_OPERATOR_GUIDE.md): members queue radio
// prayers, the real station code (apps/station) claims them as a burst, encodes them, "sends" them
// with the simulate transmitter (a WAV file, nothing keyed), a separate receiver decodes that WAV,
// and a listener node reports what it heard. Then the queue, burst log, operator log, operator
// console, signal queue and "where it was heard" must all agree. The station talks to this server
// through its own HTTP client, routed in-process, so no network or radio is involved.
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { signalCode } from '@prayer-tower/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as oplog from '../src/modules/radio/oplog.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as signalQueue from '../src/modules/radio/signal-queue.js';
import * as trail from '../src/modules/radio/trail.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

// The station's own code (apps/station). Imported by a computed path, since this package's
// typecheck can't include another package's sources; the shapes used here are written out.
const STATION = new URL('../../station/src/', import.meta.url).href;
const load = <T>(file: string) => import(STATION + file) as Promise<T>;
type Transmitter = { mode: string };
const { listen } = await load<{ listen: (audio: Float32Array) => { callSign: string; prayers: string[] }[] }>('burst/burst.js');
const { presetByName } = await load<{ presetByName: (name: string) => unknown }>('burst/presets.js');
const { simulateTransmitter } = await load<{ simulateTransmitter: (dir: string, log: (m: string) => void) => Transmitter }>('burst/transmit.js');
const { fromWav, resample } = await load<{
  fromWav: (b: Buffer) => { samples: Float32Array; sampleRate: number };
  resample: (x: Float32Array, from: number, to: number) => Float32Array;
}>('burst/wav.js');
const { runBurstOnce } = await load<{
  runBurstOnce: (api: unknown, tx: Transmitter, cfg: object, log: (m: string) => void, retryMs: number[]) => Promise<{ kind: string }>;
}>('burst/worker.js');
const { httpApi } = await load<{ httpApi: (baseUrl: string, key: string, fetchImpl: typeof fetch) => unknown }>('worker.js');

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `W${RUN}`;
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);
const node = (url: string, key: string, body: object = {}) => app.inject({ method: 'POST', url, headers: { 'x-node-key': key }, payload: body });

/** The station's own fetch-based client, answered by this app in-process. */
const inProcessFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  const res = await app.inject({
    method: (init?.method ?? 'GET') as 'GET' | 'POST',
    url: url.pathname + url.search,
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    payload: init?.body as string | undefined,
  });
  return new Response(res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? 'application/json') } });
};

const defaults = {
  station: await radio.stationSettings(db),
  tokens: await tokens.settings(db),
  schedule: await schedule.get(db),
  console: (await operatorConsole.settings(db)).enabled,
  oplog: await oplog.enabled(db),
  listeners: await nodes.enabled(db),
  signalQueue: await signalQueue.enabled(db),
  trail: await trail.enabled(db),
};

let admin: string;
let poster: string;
let sender: string;
let listenerKey: string;
const wavDir = mkdtempSync(path.join(tmpdir(), 'pt-practice-'));
const logs: string[] = [];

beforeAll(async () => {
  admin = await createUser('Practice Admin');
  await grantRole(db, admin, 'admin', null);
  poster = await createUser('Practice Poster');
  sender = await createUser('Practice Sender');
  // Nothing else of the test run's may ride in this burst.
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 10, receipts: true });
  await schedule.update(db, { ...defaults.schedule, enabled: false });
  await operatorConsole.setEnabled(db, true);
  await oplog.setEnabled(db, true);
  await nodes.setEnabled(db, true);
  await signalQueue.setEnabled(db, true);
  await trail.setEnabled(db, true);
  listenerKey = (await as(admin).post('/admin/radio-nodes', { name: `Practice listener ${RUN}` })).json().key;
});

afterAll(async () => {
  await radio.updateStationSettings(db, defaults.station);
  await tokens.updateSettings(db, defaults.tokens);
  await schedule.update(db, defaults.schedule);
  await operatorConsole.setEnabled(db, defaults.console);
  await oplog.setEnabled(db, defaults.oplog);
  await nodes.setEnabled(db, defaults.listeners);
  await signalQueue.setEnabled(db, defaults.signalQueue);
  await trail.setEnabled(db, defaults.trail);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  rmSync(wavDir, { recursive: true, force: true });
  await db.end();
});

describe('station practice mode, end to end, nothing keyed', () => {
  const texts = [`Healing for my sister ${RUN}.`, `Work for my neighbour ${RUN}.`, `Peace in our town ${RUN}.`];
  const posts: string[] = [];

  it('queue: three members\' requests wait for the station', async () => {
    for (const [i, body] of texts.entries()) {
      const p = await as(poster).post('/posts', { postType: 'prayer_request', body });
      expect(p.statusCode).toBe(201);
      posts.push(p.json().post.id);
      // The last one amplified: three copies in the same burst.
      const q = await as(sender).post(`/posts/${posts[i]}/radio`, { idempotencyKey: `practice-${RUN}-${i}`, amplify: i === 2 });
      expect(q.statusCode).toBe(201);
    }
    const view = (await as(admin).get('/radio/console')).json();
    expect(view.queue.queued).toBe(3);
    expect((await as(sender).get('/me/signal-queue')).json().signals.filter((s: { status: string }) => s.status === 'waiting')).toHaveLength(3);
  });

  it('burst: the station claims all three, encodes one burst and "sends" it in simulate mode', async () => {
    const api = httpApi('http://station.test', STATION_KEY, inProcessFetch);
    const tx = simulateTransmitter(wavDir, (m) => logs.push(m));
    expect(tx.mode).toBe('simulate');
    const out = await runBurstOnce(api, tx, { callSign: CALL, preset: presetByName('fm-standard'), maxPrayers: 10, maxFrameSeconds: 20, blocklist: [] }, (m) => logs.push(m), [0]);
    expect(out).toMatchObject({ kind: 'sent', sent: 3, rejected: 0 });
    // The simulated receiver inside the transmitter decoded every copy (3 + 2 extra amplified copies).
    expect(logs.join('\n')).toMatch(/a receiver decodes 5 prayer\(s\)/);
    const burst = (await as(admin).get('/admin/radio-bursts')).json().bursts.find((b: { call_sign: string }) => b.call_sign === CALL);
    expect(burst).toMatchObject({ mode: 'simulate', preset: 'fm-standard', prayers: 5, decoded: 5, ok: true });
    // Nothing waits any more, and nothing was keyed: the only output is the WAV file.
    expect((await as(admin).get('/radio/console')).json().queue.queued).toBe(0);
    expect(readdirSync(wavDir).filter((f) => f.endsWith('.wav'))).toHaveLength(1);
  });

  it('decode: an independent receiver reads the WAV back to the exact words and call sign', async () => {
    const file = readdirSync(wavDir).find((f) => f.endsWith('.wav'))!;
    const wav = fromWav(readFileSync(path.join(wavDir, file)));
    const heard = listen(resample(wav.samples, wav.sampleRate, 48_000));
    expect(heard.map((h) => h.callSign)).toContain(CALL);
    const decoded = heard.flatMap((h) => h.prayers);
    for (const t of texts) expect(decoded).toContain(t);
    expect(decoded.filter((t) => t === texts[2])).toHaveLength(3);

    // A listener node reports what it decoded: fingerprints only, never the words.
    await node('/node/heartbeat', listenerKey);
    const hashes = [...new Set(decoded)].map(fingerprint);
    expect((await node('/node/heard', listenerKey, { callSign: CALL, preset: 'fm-standard', snrDb: 18, hashes })).json()).toEqual({ matched: 3 });
  });

  it('log: the operator log, console, signal queue and "where it was heard" agree', async () => {
    const view = (await as(admin).get('/radio/console')).json();
    const mine = view.log.filter((l: { callSign: string }) => l.callSign === CALL);
    expect(mine).toHaveLength(3);
    expect(mine.every((l: { status: string; heard: boolean; preset: string }) => l.status === 'transmitted' && l.heard && l.preset === 'fm-standard')).toBe(true);

    const csv = await as(admin).get('/admin/operator-log?format=csv');
    expect(csv.statusCode).toBe(200);
    for (const t of texts) expect(csv.body).toContain(t);

    const signals = (await as(sender).get('/me/signal-queue')).json().signals.filter((s: { postId: string }) => posts.includes(s.postId));
    expect(signals).toHaveLength(3);
    for (const s of signals) {
      expect(s).toMatchObject({ status: 'sent', callSign: CALL, heardCount: 1 });
      // The same code a listener's Listen screen shows for the words it decoded.
      expect(s.signalCode).toBe(signalCode(fingerprint(texts[posts.indexOf(s.postId)]!)));
    }

    const where = (await as(poster).get(`/posts/${posts[0]}/radio-trail`)).json().trail;
    expect(where[0]).toMatchObject({ callSign: CALL, nodes: [expect.objectContaining({ name: `Practice listener ${RUN}`, snrDb: 18 })] });
  });
});
