// Burst batches: many prayers compressed into as few frames as fit the
// longest allowed key-up, and the frames joined into one audio clip.
import { decodeBatch, encodeBatch, fitBatch } from './codec.js';
import { demodulate, frameSeconds, modulate, SAMPLE_RATE } from './ofdm.js';
import type { BurstPreset } from './presets.js';

/** Silence between frames, so a receiver that missed one frame finds the next sync cleanly. */
const GAP_SECONDS = 0.05;

/**
 * Split prayers into batches whose frame stays under maxFrameSeconds: as many
 * prayers as fit, measured in one compression pass per frame. A single prayer
 * too long on its own still gets its own frame.
 */
export function planFrames(prayers: readonly string[], preset: BurstPreset, maxFrameSeconds: number): Uint8Array[] {
  // The largest batch (in bytes) whose frame, with its CRC-32, fits the limit.
  let lo = 0;
  let hi = 1 << 24;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frameSeconds(preset, mid + 4) <= maxFrameSeconds) lo = mid;
    else hi = mid - 1;
  }
  const out: Uint8Array[] = [];
  for (let i = 0; i < prayers.length; ) {
    // Always send at least one prayer, even one too long for a frame on its own.
    const n = Math.max(1, fitBatch(prayers.slice(i), lo));
    out.push(encodeBatch(prayers.slice(i, i + n)));
    i += n;
  }
  return out;
}

export interface Burst {
  audio: Float32Array;
  sampleRate: number;
  frames: number;
  seconds: number;
  bytes: number;
}

/** Audio for all frames, back to back, with a short lead-in so the radio's audio settles. */
export function buildBurst(batches: Uint8Array[], preset: BurstPreset, callSign: string, leadSeconds = 0.1): Burst {
  const parts = batches.map((b) => modulate(b, preset, callSign));
  const lead = Math.round(leadSeconds * SAMPLE_RATE);
  const gap = Math.round(GAP_SECONDS * SAMPLE_RATE);
  const total = lead + parts.reduce((n, p) => n + p.length + gap, 0);
  const audio = new Float32Array(total);
  let at = lead;
  for (const p of parts) {
    audio.set(p, at);
    at += p.length + gap;
  }
  return { audio, sampleRate: SAMPLE_RATE, frames: parts.length, seconds: total / SAMPLE_RATE, bytes: batches.reduce((n, b) => n + b.length, 0) };
}

export interface HeardPrayers {
  callSign: string;
  preset: string;
  prayers: string[];
  corrected: boolean;
  /** Estimated signal-to-noise ratio in 2.5 kHz (dB). */
  snrDb: number;
}

/** Everything decodable in a 48 kHz recording, frame by frame. */
export function listen(audio: Float32Array): HeardPrayers[] {
  return demodulate(audio).map((f) => ({ callSign: f.callSign, preset: f.preset, prayers: decodeBatch(f.batch), corrected: f.corrected, snrDb: f.snrDb }));
}
