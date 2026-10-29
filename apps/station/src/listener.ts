// Receive-only listener node (docs/STATION_OPERATOR_GUIDE.md, "Listener nodes").
// A Raspberry Pi with a receiver on its sound card records continuously, keeps
// the last 24 seconds, decodes them every few seconds, and for each new frame
// reports what it measured (call sign, preset, SNR) to Prayer Tower. A station
// on BURST_PRESET=auto then picks its preset from real reception. It also
// reports the prayers' fingerprints (never the words): that acknowledges them
// (a prayer nobody heard is sent again, while that switch is on) and, with radio
// receipts on, tells senders a listener decoded their prayer. A heartbeat about
// once a minute tells the server the listener is running.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { channelReport, decodeAudio, fingerprint, type HeardFrame } from './burst/web.js';
import { demodulate as demodulatePackets } from './packet/afsk.js';
import { parseStatus, type PacketStatus } from './packet/message.js';

export const RATE = 48_000;
const KEEP_SECONDS = 24;

/** A decoded frame and how loud it arrived: the setup wizard's level check (near 0 dBFS clips, under -30 is quiet). */
export type ListenedFrame = HeardFrame & { peakDbfs: number };

/** The loudest sample, in dBFS to 0.1 dB (-200 for silence). */
export function peakDbfs(samples: Float32Array): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  return peak ? Math.round(200 * Math.log10(peak)) / 10 : -200;
}

/** The last KEEP_SECONDS of audio, decoded on demand; each frame is returned once. */
export class RollingDecoder {
  private chunks: Float32Array[] = [];
  private total = 0;
  private dropped = 0;
  private decodedUpTo = 0;
  private packetsUpTo = 0;
  /** Packet fallback status frames decoded by the last decode() (packet/message.ts). */
  packets: PacketStatus[] = [];

  push(samples: Float32Array) {
    if (!samples.length) return;
    this.chunks.push(samples);
    this.total += samples.length;
  }

  decode(searchHz = 0): ListenedFrame[] {
    if (!this.total) return [];
    const buf = new Float32Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      buf.set(c, at);
      at += c.length;
    }
    const from = Math.max(0, this.decodedUpTo - this.dropped);
    const fresh: ListenedFrame[] = [];
    for (const f of decodeAudio(buf.subarray(from), RATE, searchHz)) {
      const end = this.dropped + from + f.end;
      if (end <= this.decodedUpTo) continue;
      this.decodedUpTo = end;
      fresh.push({ ...f, peakDbfs: peakDbfs(buf.subarray(from + f.start, from + f.end)) });
    }
    // The packet fallback's 1200-baud frames, each once.
    const pFrom = Math.max(0, this.packetsUpTo - this.dropped);
    this.packets = [];
    for (const p of demodulatePackets(buf.subarray(pFrom), RATE)) {
      const end = this.dropped + pFrom + p.end;
      if (end <= this.packetsUpTo) continue;
      this.packetsUpTo = end;
      const status = parseStatus(p.frame);
      if (status) this.packets.push(status);
    }
    while (this.chunks.length > 1 && this.total - this.chunks[0]!.length > KEEP_SECONDS * RATE) {
      const first = this.chunks.shift()!;
      this.total -= first.length;
      this.dropped += first.length;
    }
    return fresh;
  }
}

/** Signed 16-bit little-endian mono PCM to samples between -1 and 1; an odd trailing byte is carried to the next chunk. */
export function s16le(buf: Buffer, carry: { rest: Buffer }): Float32Array {
  const data = carry.rest.length ? Buffer.concat([carry.rest, buf]) : buf;
  const n = Math.floor(data.length / 2);
  carry.rest = data.subarray(n * 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

export interface ListenerApi {
  channelReport(r: { callSign: string; preset: string; snrDb: number }): Promise<void>;
  heard(r: { callSign: string; preset: string; snrDb: number; hashes: string[]; peakDbfs?: number }): Promise<void>;
  heartbeat(location?: NodeLocation): Promise<void>;
  /** The packet fallback's short IDs (POST /node/heard-ids). */
  heardIds?(r: { callSign: string; ids: string[] }): Promise<void>;
}

/**
 * Signed headers (LISTEN_SIGN=on, docs/STATION_OPERATOR_GUIDE.md, "Signed listener
 * reports"): the key never leaves the node. The HMAC is keyed with sha256(key) in
 * hex, which is what the server keeps, over "<ts>\n<METHOD>\n<path>\n<body>".
 */
export function signedHeaders(nodeKey: string, method: string, path: string, body: string, ts: number): Record<string, string> {
  const secret = createHash('sha256').update(nodeKey).digest('hex');
  return {
    'x-node-kid': secret.slice(0, 16),
    'x-node-ts': String(ts),
    'x-node-sig': createHmac('sha256', secret).update(`${ts}\n${method}\n${path}\n${body}`).digest('hex'),
  };
}

/** Prayer Tower's listener endpoints: POST /node/channel-report, /node/heard and /node/heartbeat, with the node key (x-node-key) or, signed, without it. */
export function httpListenerApi(baseUrl: string, nodeKey: string, fetchImpl: typeof fetch = fetch, opts: { sign?: boolean } = {}): ListenerApi {
  const base = baseUrl.replace(/\/$/, '');
  // Each signature's timestamp must be newer than the last (the server refuses replays).
  let lastTs = 0;
  const post = (path: string, body: object) => {
    const text = JSON.stringify(body);
    const auth = opts.sign ? signedHeaders(nodeKey, 'POST', path, text, (lastTs = Math.max(Date.now(), lastTs + 1))) : { 'x-node-key': nodeKey };
    return fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: text,
      signal: AbortSignal.timeout(10_000),
    });
  };
  return {
    async channelReport(r) {
      const res = await post('/node/channel-report', r);
      // 404: an admin has listener reports switched off.
      if (!res.ok && res.status !== 404) throw new Error(`channel report failed (${res.status})`);
    },
    async heard(r) {
      const res = await post('/node/heard', r);
      // 404: receipts, acknowledgements and listener reports are all switched off.
      if (!res.ok && res.status !== 404) throw new Error(`receipt failed (${res.status})`);
    },
    async heardIds(r) {
      const res = await post('/node/heard-ids', r);
      // 404: the packet fallback is switched off.
      if (!res.ok && res.status !== 404) throw new Error(`packet receipt failed (${res.status})`);
    },
    async heartbeat(location) {
      const res = await post('/node/heartbeat', location ? { location } : {});
      if (!res.ok) throw new Error(`heartbeat failed (${res.status})`);
    },
  };
}

/** NODE_LOCATION (opt-in): where the node is, for the coverage map. The server rounds it to about a city. */
export interface NodeLocation {
  lat: number;
  lon: number;
  place?: string;
}

/** "lat,lon" or "lat,lon,Place name" (e.g. "39.8,-89.6,Springfield IL"); empty or unset shares nothing. */
export function parseLocation(value: string | undefined): NodeLocation | undefined {
  if (!value?.trim()) return undefined;
  const [lat, lon, ...rest] = value.split(',');
  const la = Number(lat?.trim()), lo = Number(lon?.trim());
  if (!lat?.trim() || !lon?.trim() || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) throw new Error('NODE_LOCATION must be "lat,lon" or "lat,lon,Place"');
  const place = rest.join(',').trim().slice(0, 80);
  // Rounded here too, so nothing finer than about a city ever leaves the node.
  return { lat: Math.round(la * 10) / 10, lon: Math.round(lo * 10) / 10, ...(place ? { place } : {}) };
}

export interface ListenerConfig {
  searchHz: number;
  /** Also report prayers' fingerprints, for acknowledgements and "heard" receipts. */
  receipts: boolean;
  /** Also write the latest channel report here, for a station on the same machine (BURST_AUTO_REPORT). */
  reportFile?: string;
}

/** Decode what arrived and report each new frame. Returns the frames, for the log. Reporting errors are logged, never thrown. */
export async function listenOnce(dec: RollingDecoder, api: ListenerApi, cfg: ListenerConfig, log: (m: string) => void = console.log): Promise<ListenedFrame[]> {
  const frames = dec.decode(cfg.searchHz);
  for (const p of dec.packets) {
    log(`[listener] heard ${p.callSign} by packet: ${p.count} prayer(s), page ${p.page}/${p.pages}`);
    if (cfg.receipts && p.ids.length && api.heardIds) await api.heardIds({ callSign: p.callSign, ids: p.ids }).catch((err: Error) => log(`[listener] ${err.message}`));
  }
  if (!frames.length) return frames;
  // One channel report per station heard: its weakest frame.
  const byStation = new Map<string, ListenedFrame[]>();
  // A relayed frame's signal is the relay's, not the station's, so it never steers the station's preset.
  for (const f of frames.filter((x) => !x.via)) byStation.set(f.callSign, [...(byStation.get(f.callSign) ?? []), f]);
  for (const [callSign, fs] of byStation) {
    const r = channelReport(fs)!;
    log(`[listener] heard ${callSign}: ${fs.length} frame(s), ${r.snrDb} dB, ${r.preset}`);
    await api.channelReport({ callSign, preset: r.preset, snrDb: r.snrDb }).catch((err: Error) => log(`[listener] ${err.message}`));
    if (cfg.reportFile) await writeFile(cfg.reportFile, `${JSON.stringify(r, null, 2)}\n`).catch((err: Error) => log(`[listener] ${err.message}`));
  }
  if (cfg.receipts) {
    for (const f of frames) {
      const hashes = [...new Set(f.prayers ?? [])].slice(0, 500).map(fingerprint);
      if (hashes.length) await api.heard({ callSign: f.callSign, preset: f.preset, snrDb: Math.round(f.snrDb * 10) / 10, hashes, peakDbfs: f.peakDbfs }).catch((err: Error) => log(`[listener] ${err.message}`));
    }
  }
  return frames;
}

/** Default recorder: 48 kHz mono 16-bit raw PCM on stdout. arecord (ALSA) on Linux, sox's rec on macOS. */
export function defaultRecordCommand(platform = process.platform) {
  return platform === 'darwin' ? 'rec -q -t raw -b 16 -e signed-integer -r 48000 -c 1 -' : 'arecord -q -t raw -f S16_LE -r 48000 -c 1';
}

/**
 * Run the recorder and feed the decoder; restarts the recorder if it stops.
 * The command is split on spaces and run without a shell (no quoting: sound card
 * names such as plughw:CARD=Device,DEV=0 have no spaces).
 */
export function startRecorder(command: string, dec: RollingDecoder, log: (m: string) => void = console.log): { stop(): void } {
  const [file, ...args] = command.trim().split(/\s+/);
  if (!file) throw new Error('LISTEN_RECORD_CMD is empty');
  let child: ChildProcess | null = null;
  let stopped = false;
  const start = () => {
    const carry = { rest: Buffer.alloc(0) };
    child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', (d: Buffer) => dec.push(s16le(d, carry)));
    child.stderr!.on('data', (d: Buffer) => log(`[listener] recorder: ${d.toString().trim().slice(0, 200)}`));
    // 'exit' may not follow a failed start ('error'), so either one restarts it, once.
    let restarted = false;
    const restart = (why: string) => {
      if (stopped || restarted) return;
      restarted = true;
      log(`[listener] recorder ${why}; restarting in 5 s`);
      setTimeout(() => !stopped && start(), 5_000);
    };
    child.on('error', (err) => restart(`failed: ${err.message}`));
    child.on('exit', (code) => restart(`exited (${code})`));
  };
  start();
  return {
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}
