// The Listen screen's decoding loop, kept apart from the screen so it can be
// tested. The same rolling window as the /listen web page: keep the last
// 24 seconds of microphone audio, decode it every couple of seconds, and hand
// back only frames that end after the last one shown.
import { decodeAudio, fingerprint, readSstv, type HeardFrame, type PanelRead } from './burst-decoder.generated';

export type { HeardFrame, PanelRead };
export { drawPanel, readPanel } from './burst-decoder.generated';
export { channelReport } from './burst-decoder.generated';

const KEEP_SECONDS = 24;

export class BurstListener {
  private chunks: Float32Array[] = [];
  private total = 0;
  /** Samples dropped off the front of the window so far. */
  private dropped = 0;
  /** End of the last frame shown, in samples since listening started. */
  private decodedUpTo = 0;
  private level = 0;

  constructor(readonly rate: number) {}

  /** Add microphone samples (mono, -1 to 1). */
  push(samples: Float32Array) {
    if (!samples.length) return;
    this.chunks.push(samples);
    this.total += samples.length;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
    this.level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
  }

  /** Loudness of the latest audio, 0 to 1, for the meter. */
  get meter() {
    return this.level;
  }

  /** Decode what has arrived and return the frames not shown yet. searchHz: allow an HF (SSB) radio tuned that far off. */
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
    for (const f of decodeAudio(buf.subarray(from), this.rate, searchHz)) {
      const end = this.dropped + from + Math.round((f.end * this.rate) / 48_000);
      if (end <= this.decodedUpTo) continue;
      this.decodedUpTo = end;
      fresh.push(f);
    }
    while (this.chunks.length > 1 && this.total - this.chunks[0]!.length > KEEP_SECONDS * this.rate) {
      const first = this.chunks.shift()!;
      this.total -= first.length;
      this.dropped += first.length;
    }
    return fresh;
  }
}

/** The preset name a prayer panel heard as SSTV goes by, as the station reports it. */
export const SSTV_PRESET = 'sstv-robot36';
/** A Robot 36 picture is 37 seconds; keep a little more so one is always whole in the window. */
const SSTV_KEEP_SECONDS = 45;
const SSTV_RATE = 12_000;

/**
 * Prayer panels sent as SSTV pictures (Robot 36): keeps the last 45 seconds at 12 kHz and
 * finds a whole picture in them, each picture once.
 */
export class SstvListener {
  private buf = new Float32Array(SSTV_KEEP_SECONDS * SSTV_RATE);
  private filled = 0;
  /** Samples taken in so far (at 12 kHz). */
  private taken = 0;
  /** End of the last picture read, in samples since listening started. */
  private readUpTo = 0;
  private carry = 0;
  private acc = 0;
  private accN = 0;

  constructor(readonly rate: number) {}

  /** Add microphone samples (mono): averaged down to 12 kHz. */
  push(samples: Float32Array) {
    const step = this.rate / SSTV_RATE;
    for (let i = 0; i < samples.length; i++) {
      this.acc += samples[i]!;
      this.accN++;
      this.carry += 1;
      if (this.carry >= step) {
        this.carry -= step;
        this.add(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
      }
    }
  }

  private add(v: number) {
    // Full: drop the oldest second at once.
    if (this.filled === this.buf.length) {
      this.buf.copyWithin(0, SSTV_RATE);
      this.filled -= SSTV_RATE;
    }
    this.buf[this.filled++] = v;
    this.taken++;
  }

  /** A panel whose picture ended since the last one read, or null. */
  read(): { panel: PanelRead | null; end: number } | null {
    if (this.filled < 38 * SSTV_RATE) return null;
    const startAt = this.taken - this.filled;
    const found = readSstv(this.buf.subarray(0, this.filled), SSTV_RATE);
    if (!found) return null;
    const end = startAt + found.end;
    if (end <= this.readUpTo) return null;
    this.readUpTo = end;
    return { panel: found.panel, end };
  }
}

/** Float32 or 16-bit PCM from the microphone stream, as mono samples between -1 and 1. */
export function toMono(data: ArrayBuffer, channels: number, encoding: 'float32' | 'int16'): Float32Array {
  const raw = encoding === 'float32' ? new Float32Array(data) : Int16Array.from(new Int16Array(data));
  const scale = encoding === 'float32' ? 1 : 1 / 32768;
  const out = new Float32Array(Math.floor(raw.length / channels));
  for (let i = 0; i < out.length; i++) out[i] = raw[i * channels]! * scale;
  return out;
}

/** Fingerprints of a frame's prayers for an "on the air" receipt (never the words). */
export function receiptHashes(frame: HeardFrame): string[] {
  return [...new Set(frame.prayers ?? [])].slice(0, 500).map((p) => fingerprint(p));
}

/** One prayer's fingerprint, for "I'm praying too" (praying-too.ts). */
export function prayerHash(text: string): string {
  return fingerprint(text);
}
