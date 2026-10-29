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
import { writeFile } from 'node:fs/promises';
import { channelReport, decodeAudio, fingerprint, type HeardFrame } from './burst/web.js';

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
}

/** Prayer Tower's listener endpoints: POST /node/channel-report, /node/heard and /node/heartbeat, each with the node key (x-node-key). */
export function httpListenerApi(baseUrl: string, nodeKey: string, fetchImpl: typeof fetch = fetch): ListenerApi {
  const base = baseUrl.replace(/\/$/, '');
  const post = (path: string, body: object) =>
    fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-node-key': nodeKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
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
  if (!frames.length) return frames;
  // One channel report per station heard: its weakest frame.
  const byStation = new Map<string, ListenedFrame[]>();
  for (const f of frames) byStation.set(f.callSign, [...(byStation.get(f.callSign) ?? []), f]);
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
