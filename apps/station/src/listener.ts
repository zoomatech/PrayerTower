// Receive-only listener node (docs/STATION_OPERATOR_GUIDE.md, "Listener nodes").
// A Raspberry Pi with a receiver on its sound card records continuously, keeps
// the last 24 seconds, decodes them every few seconds, and for each new frame
// reports what it measured (call sign, preset, SNR) to Prayer Tower. A station
// on BURST_PRESET=auto then picks its preset from real reception. With radio
// receipts on, it also reports the prayers' fingerprints (never the words), so
// senders hear that a listener decoded their prayer.
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { channelReport, decodeAudio, fingerprint, type HeardFrame } from './burst/web.js';

export const RATE = 48_000;
const KEEP_SECONDS = 24;

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

  decode(searchHz = 0): HeardFrame[] {
    if (!this.total) return [];
    const buf = new Float32Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      buf.set(c, at);
      at += c.length;
    }
    const from = Math.max(0, this.decodedUpTo - this.dropped);
    const fresh: HeardFrame[] = [];
    for (const f of decodeAudio(buf.subarray(from), RATE, searchHz)) {
      const end = this.dropped + from + f.end;
      if (end <= this.decodedUpTo) continue;
      this.decodedUpTo = end;
      fresh.push(f);
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
  heard(r: { callSign: string; preset: string; snrDb: number; hashes: string[] }): Promise<void>;
}

/** Prayer Tower's listener endpoints: POST /node/channel-report (x-node-key) and the public POST /listen/heard. */
export function httpListenerApi(baseUrl: string, nodeKey: string, fetchImpl: typeof fetch = fetch): ListenerApi {
  const base = baseUrl.replace(/\/$/, '');
  const post = (path: string, body: object, key: boolean) =>
    fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-node-key': nodeKey } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  return {
    async channelReport(r) {
      const res = await post('/node/channel-report', r, true);
      // 404: an admin has listener reports switched off.
      if (!res.ok && res.status !== 404) throw new Error(`channel report failed (${res.status})`);
    },
    async heard(r) {
      const res = await post('/listen/heard', r, false);
      // 404: receipts are switched off.
      if (!res.ok && res.status !== 404) throw new Error(`receipt failed (${res.status})`);
    },
  };
}

export interface ListenerConfig {
  searchHz: number;
  /** Also report prayers' fingerprints for "heard" receipts. */
  receipts: boolean;
  /** Also write the latest channel report here, for a station on the same machine (BURST_AUTO_REPORT). */
  reportFile?: string;
}

/** Decode what arrived and report each new frame. Returns the frames, for the log. Reporting errors are logged, never thrown. */
export async function listenOnce(dec: RollingDecoder, api: ListenerApi, cfg: ListenerConfig, log: (m: string) => void = console.log): Promise<HeardFrame[]> {
  const frames = dec.decode(cfg.searchHz);
  if (!frames.length) return frames;
  // One channel report per station heard: its weakest frame.
  const byStation = new Map<string, HeardFrame[]>();
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
      if (hashes.length) await api.heard({ callSign: f.callSign, preset: f.preset, snrDb: Math.round(f.snrDb * 10) / 10, hashes }).catch((err: Error) => log(`[listener] ${err.message}`));
    }
  }
  return frames;
}

/** Default recorder: 48 kHz mono 16-bit raw PCM on stdout. arecord (ALSA) on Linux, sox's rec on macOS. */
export function defaultRecordCommand(platform = process.platform) {
  return platform === 'darwin' ? 'rec -q -t raw -b 16 -e signed-integer -r 48000 -c 1 -' : 'arecord -q -t raw -f S16_LE -r 48000 -c 1';
}

/** Run the recorder and feed the decoder; restarts the recorder if it stops. */
export function startRecorder(command: string, dec: RollingDecoder, log: (m: string) => void = console.log): { stop(): void } {
  let child: ChildProcess | null = null;
  let stopped = false;
  const start = () => {
    const carry = { rest: Buffer.alloc(0) };
    child = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', (d: Buffer) => dec.push(s16le(d, carry)));
    child.stderr!.on('data', (d: Buffer) => log(`[listener] recorder: ${d.toString().trim().slice(0, 200)}`));
    child.on('exit', (code) => {
      if (stopped) return;
      log(`[listener] recorder exited (${code}); restarting in 5 s`);
      setTimeout(() => !stopped && start(), 5_000);
    });
  };
  start();
  return {
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}
