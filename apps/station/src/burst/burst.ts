// Burst batches: many prayers compressed into as few frames as fit the
// longest allowed key-up, and the frames joined into one audio clip.
import { decodeBatch, encodeBatch } from './codec.js';
import { demodulate, frameSeconds, modulate, SAMPLE_RATE } from './ofdm.js';
import type { BurstPreset } from './presets.js';

/** Silence between frames, so a receiver that missed one frame finds the next sync cleanly. */
const GAP_SECONDS = 0.05;

/**
 * Split prayers into batches whose frame stays under maxFrameSeconds: the
 * most prayers that fit, found by binary search. A single prayer too long on
 * its own still gets its own frame.
 */
export function planFrames(prayers: readonly string[], preset: BurstPreset, maxFrameSeconds: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  const fits = (b: Uint8Array) => frameSeconds(preset, b.length + 4) <= maxFrameSeconds;
  for (let i = 0; i < prayers.length; ) {
    let lo = 1; // known to be sent (even if it does not fit)
    let best = encodeBatch(prayers.slice(i, i + 1));
    let hi = prayers.length - i;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const b = encodeBatch(prayers.slice(i, i + mid));
      if (fits(b)) {
        lo = mid;
        best = b;
      } else hi = mid - 1;
    }
    out.push(best);
    i += lo;
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
}

/** Everything decodable in a 48 kHz recording, frame by frame. */
export function listen(audio: Float32Array): HeardPrayers[] {
  return demodulate(audio).map((f) => ({ callSign: f.callSign, preset: f.preset, prayers: decodeBatch(f.batch), corrected: f.corrected }));
}
