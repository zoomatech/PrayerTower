// SSTV prayer panels end to end in practice mode (docs/RADIO_BURST.md, "Prayer panel"): members
// queue radio prayers, the real station code (apps/station, BURST_MODE=sstv with SSTV_SEND=simulate)
// claims them, packs them into a panel and "sends" it as a Robot 36 picture to a WAV file, nothing
// keyed. A separate receiver reads the picture back, a listener node reports what it heard, and the
// operator console, the signal queue and the members' latest panel must all agree. The station talks
// to this server through its own HTTP client, routed in-process (as station-practice.test.ts).
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as operatorConsole from '../src/modules/radio/console.js';
import * as radio from '../src/modules/radio/index.js';
import * as nodes from '../src/modules/radio/nodes.js';
import * as panel from '../src/modules/radio/panel.js';
import * as schedule from '../src/modules/radio/schedule.js';
import * as signalQueue from '../src/modules/radio/signal-queue.js';
import * as tokens from '../src/modules/tokens/index.js';
import { app, as, createUser, db, STATION_KEY } from './helpers.js';

// The station's own code, by a computed path (this package's typecheck can't include it).
const STATION = new URL('../../station/src/', import.meta.url).href;
const load = <T>(file: string) => import(STATION + file) as Promise<T>;
type Transmitter = { mode: string };
const { simulateTransmitter } = await load<{ simulateTransmitter: (dir: string, log: (m: string) => void) => Transmitter }>('burst/transmit.js');
const { fromWav } = await load<{ fromWav: (b: Buffer) => { samples: Float32Array; sampleRate: number } }>('burst/wav.js');
const { decodeBatch } = await load<{ decodeBatch: (b: Uint8Array) => string[] }>('burst/codec.js');
const { decodeRobot36 } = await load<{ decodeRobot36: (x: Float32Array, rate: number) => { gray: Uint8Array } | null }>('panel/sstv.js');
const { decodePanelImage } = await load<{ decodePanelImage: (g: Uint8Array, w: number, h: number) => { callSign: string; batch: Uint8Array } | null }>('panel/panel.js');
const { runSstvOnce } = await load<{
  runSstvOnce: (api: unknown, tx: Transmitter, cfg: object, log: (m: string) => void, retryMs: number[]) => Promise<{ kind: string }>;
}>('panel/worker.js');
const { httpApi } = await load<{ httpApi: (baseUrl: string, key: string, fetchImpl: typeof fetch) => unknown }>('worker.js');

const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const CALL = `K${RUN}`;
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 32);

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
  listeners: await nodes.enabled(db),
  signalQueue: await signalQueue.enabled(db),
  panel: await panel.enabled(db),
};

let admin: string;
let poster: string;
let sender: string;
let listenerKey: string;
const wavDir = mkdtempSync(path.join(tmpdir(), 'pt-sstv-practice-'));
const logs: string[] = [];

beforeAll(async () => {
  admin = await createUser('SSTV Admin');
  await grantRole(db, admin, 'admin', null);
  poster = await createUser('SSTV Poster');
  sender = await createUser('SSTV Sender');
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  await tokens.updateSettings(db, { radio_funding: 'free' });
  await as(admin).patch('/admin/radio-settings', { transmitter: 'station', order: 'oldest', batchMax: 10, receipts: true });
  await schedule.update(db, { ...defaults.schedule, enabled: false });
  await operatorConsole.setEnabled(db, true);
  await nodes.setEnabled(db, true);
  await signalQueue.setEnabled(db, true);
  await panel.setEnabled(db, true);
  listenerKey = (await as(admin).post('/admin/radio-nodes', { name: `SSTV listener ${RUN}` })).json().key;
});

afterAll(async () => {
  await radio.updateStationSettings(db, defaults.station);
  await tokens.updateSettings(db, defaults.tokens);
  await schedule.update(db, defaults.schedule);
  await operatorConsole.setEnabled(db, defaults.console);
  await nodes.setEnabled(db, defaults.listeners);
  await signalQueue.setEnabled(db, defaults.signalQueue);
  await panel.setEnabled(db, defaults.panel);
  await db.query(`update public.radio_prayers set status = 'failed', error = 'test reset' where status in ('queued', 'sending')`);
  rmSync(wavDir, { recursive: true, force: true });
  await db.end();
});

describe('SSTV prayer panels in practice mode, end to end, nothing keyed', () => {
  const texts = [`Strength for a nurse on night shift ${RUN}.`, `A safe drive home for my son ${RUN}.`, `Rain for the farms ${RUN}.`];
  const posts: string[] = [];

  it('queue: three members\' requests wait for the station', async () => {
    for (const [i, body] of texts.entries()) {
      const p = await as(poster).post('/posts', { postType: 'prayer_request', body });
      expect(p.statusCode).toBe(201);
      posts.push(p.json().post.id);
      expect((await as(sender).post(`/posts/${posts[i]}/radio`, { idempotencyKey: `sstv-${RUN}-${i}` })).statusCode).toBe(201);
    }
    expect((await as(admin).get('/radio/console')).json().queue.queued).toBe(3);
  });

  it('send: the station packs all three into one panel and "sends" it as an SSTV picture', async () => {
    const api = httpApi('http://station.test', STATION_KEY, inProcessFetch);
    const tx = simulateTransmitter(wavDir, (m) => logs.push(m));
    const out = await runSstvOnce(api, tx, { callSign: CALL, maxPrayers: 10, blocklist: [] }, (m) => logs.push(m), [0]);
    expect(out).toMatchObject({ kind: 'sent', sent: 3, rejected: 0, panels: 1 });
    expect(logs.join('\n')).toMatch(new RegExp(`a receiver reads 3 prayer\\(s\\) from the picture \\(de ${CALL}\\)`));
    expect((await as(admin).get('/radio/console')).json().queue.queued).toBe(0);
    expect(readdirSync(wavDir).filter((f) => f.startsWith('sstv-') && f.endsWith('.wav'))).toHaveLength(1);
  });

  it('receive: an independent receiver reads the picture back, and a listener node reports it', async () => {
    const file = readdirSync(wavDir).find((f) => f.startsWith('sstv-'))!;
    const wav = fromWav(readFileSync(path.join(wavDir, file)));
    const pic = decodeRobot36(wav.samples, wav.sampleRate);
    const frame = pic && decodePanelImage(pic.gray, 320, 240);
    expect(frame?.callSign).toBe(CALL);
    const heard = decodeBatch(frame!.batch);
    expect(heard).toEqual(texts);
    await app.inject({ method: 'POST', url: '/node/heartbeat', headers: { 'x-node-key': listenerKey }, payload: {} });
    const r = await app.inject({ method: 'POST', url: '/node/heard', headers: { 'x-node-key': listenerKey }, payload: { callSign: CALL, preset: 'sstv-robot36', snrDb: 12, hashes: heard.map(fingerprint) } });
    expect(r.json()).toEqual({ matched: 3 });
  });

  it('agree: the console log, the signal queue and the members\' latest panel', async () => {
    const mine = (await as(admin).get('/radio/console')).json().log.filter((l: { callSign: string }) => l.callSign === CALL);
    expect(mine).toHaveLength(3);
    expect(mine.every((l: { status: string; heard: boolean; preset: string }) => l.status === 'transmitted' && l.heard && l.preset === 'sstv-robot36')).toBe(true);
    const signals = (await as(sender).get('/me/signal-queue')).json().signals.filter((s: { postId: string }) => posts.includes(s.postId));
    expect(signals.map((s: { status: string; callSign: string; heardCount: number }) => [s.status, s.callSign, s.heardCount])).toEqual(Array(3).fill(['sent', CALL, 1]));
    const latest = (await as(poster).get('/radio/panel')).json();
    for (const t of texts) expect(latest.prayers).toContain(t);
  });
});
