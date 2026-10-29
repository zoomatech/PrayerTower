// The packet fallback under the same receive faults as the bursts
// (robustness.test.ts), plus "twist": FM radios' pre-emphasis and
// de-emphasis leave the 2200 Hz tone louder or quieter than 1200 Hz.
import { describe, expect, it } from 'vitest';
import { demodulate, encodeFrame, modulate } from '../src/packet/afsk.js';
import { parseStatus, statusFrames } from '../src/packet/message.js';

const RATE = 48_000;
const frames = statusFrames('N0CALL-9', ['3fa9c1', '07b2de', '9c44e0', 'a1b2c3', 'd4e5f6', '0a0b0c', '112233']).map(encodeFrame);
const clean = modulate(frames, RATE);
const pages = (audio: Float32Array) => demodulate(audio, RATE).map((d) => parseStatus(d.frame)?.page);

/**
 * A 6 dB-per-octave slope, what a missing or doubled emphasis stage gives:
 * a one-pole low-pass (de-emphasis, 2200 Hz about 5 dB below 1200 Hz) or a
 * one-zero high-pass (pre-emphasis, about 5 dB above).
 */
function twist(audio: Float32Array, dir: 'down' | 'up'): Float32Array {
  const out = new Float32Array(audio.length);
  let prev = 0;
  for (let i = 0; i < audio.length; i++) {
    out[i] = dir === 'down' ? 0.98 * prev + 0.1 * audio[i]! : audio[i]! - 0.98 * prev;
    prev = dir === 'down' ? out[i]! : audio[i]!;
  }
  return out;
}

describe('packet receive robustness', () => {
  it('decodes packet recorded far too quietly (about -50 dBFS)', () => {
    expect(pages(clean.map((s) => s * 0.006))).toEqual([1, 2]);
  });

  it('decodes packet the receiver overdrove into hard clipping', () => {
    expect(pages(clean.map((s) => Math.max(-0.1, Math.min(0.1, s))))).toEqual([1, 2]);
  });

  it('decodes through 60 Hz hum and a DC offset', () => {
    expect(pages(clean.map((s, i) => s + 0.3 * Math.sin((2 * Math.PI * 60 * i) / RATE) + 0.2))).toEqual([1, 2]);
  });

  it('survives a dropout of broken samples: the frame it hits is dropped, the rest decode', () => {
    const hit = clean.slice();
    const mid = Math.floor(hit.length * 0.75);
    for (let i = mid; i < mid + 200; i++) hit[i] = i % 2 ? Number.NaN : Number.POSITIVE_INFINITY;
    const got = pages(hit);
    expect(got).toContain(1);
    expect(got.every((p) => p === 1 || p === 2)).toBe(true);
  });

  it('decodes with about 5 dB of twist either way', () => {
    for (const dir of ['down', 'up'] as const) expect(pages(twist(clean, dir))).toEqual([1, 2]);
  });
});
