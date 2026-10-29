// The Listen screen's decoding loop, kept apart from the screen so it can be
// tested. The same rolling window as the /listen web page: keep the last
// 24 seconds of microphone audio, decode it every couple of seconds, and hand
// back only frames that end after the last one shown.
import { decodeAudio, fingerprint, type HeardFrame } from './burst-decoder.generated';

export type { HeardFrame };
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

  /** Decode what has arrived and return the frames not shown yet. */
  decode(): HeardFrame[] {
    if (!this.total) return [];
    const buf = new Float32Array(this.total);
    let at = 0;
    for (const c of this.chunks) {
      buf.set(c, at);
      at += c.length;
    }
    const from = Math.max(0, this.decodedUpTo - this.dropped);
    const fresh: HeardFrame[] = [];
    for (const f of decodeAudio(buf.subarray(from), this.rate)) {
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
