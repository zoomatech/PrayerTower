// The audio layer of a burst frame (docs/RADIO_BURST.md, "Waveform").
//
//   sync symbol      known phases on bins 16-63, for timing
//   header symbols   DBPSK on bins 16-63, referenced to the sync symbol
//   reference symbol known phases on the preset's carriers
//   payload symbols  differential PSK on the preset's carriers
//
// Every symbol is fftSize samples with a cyclic prefix of `guard` samples.
// Sync and header use bins 16-63 (750-2953 Hz at 48 kHz) whatever the preset,
// so a receiver finds any frame with one search and learns the preset from the header.
import { fft } from './fft.js';
import { decodeHeader, decodePayload, encodeHeader, encodePayload, HEADER_BYTES, HEADER_PARITY, payloadLength, type FrameHeader } from './frame.js';
import { carriers, PRESETS, symbolSamples, type BurstPreset } from './presets.js';

const SAMPLE_RATE = 48_000;
const N = 1024;
const GUARD = 128;
const SYNC_FIRST = 16;
const SYNC_LAST = 63;
/** Target RMS level of the audio (full scale is 1); peaks above CLIP are limited. */
const RMS = 0.2;
const CLIP = 0.95;
/** The receiver's FFT window starts this many samples into the guard, to absorb filter delay. */
const BACKOFF = 32;

/** Known pseudo-random QPSK phases (xorshift32 seeded per use), so receivers can rebuild them. */
function knownPhases(seed: number, count: number): number[] {
  let x = seed >>> 0 || 1;
  return Array.from({ length: count }, () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return ((x >>> 30) & 3) * (Math.PI / 2) + Math.PI / 4;
  });
}
const SYNC_SEED = 0x50545331; // "PTS1"
const REF_SEED = 0x50545232; // "PTR2"

/** One OFDM symbol (with cyclic prefix) from carrier phases on bins firstBin.. */
function symbol(firstBin: number, phases: number[]): Float64Array {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  phases.forEach((ph, i) => {
    const k = firstBin + i;
    re[k] = Math.cos(ph);
    im[k] = Math.sin(ph);
    re[N - k] = Math.cos(ph);
    im[N - k] = -Math.sin(ph);
  });
  fft(re, im, true);
  const out = new Float64Array(N + GUARD);
  out.set(re.subarray(N - GUARD), 0);
  out.set(re, GUARD);
  return out;
}

const grayToStep = (g: number) => {
  let s = g;
  for (let m = g >> 1; m; m >>= 1) s ^= m;
  return s;
};
const stepToGray = (s: number) => s ^ (s >> 1);

/** Bits (MSB first) of bytes, cut into groups of `bits`, zero padded to whole symbols of `perSymbol` groups. */
function groups(bytes: Uint8Array, bits: number, perSymbol: number): number[] {
  const out: number[] = [];
  let acc = 0;
  let n = 0;
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      acc = (acc << 1) | ((byte >> i) & 1);
      if (++n === bits) {
        out.push(acc);
        acc = 0;
        n = 0;
      }
    }
  }
  if (n) out.push(acc << (bits - n));
  while (out.length % perSymbol) out.push(0);
  return out;
}

function ungroup(values: number[], bits: number, byteCount: number): Uint8Array {
  const out = new Uint8Array(byteCount);
  let bit = 0;
  for (const v of values) {
    for (let i = bits - 1; i >= 0 && bit < byteCount * 8; i--, bit++) if ((v >> i) & 1) out[bit >> 3]! |= 0x80 >> (bit & 7);
  }
  return out;
}

/** Differential PSK: each carrier's phase moves by a Gray-coded step from the previous symbol. */
function diffSymbols(start: number[], values: number[], bits: number): number[][] {
  const c = start.length;
  const step = (2 * Math.PI) / (1 << bits);
  const syms: number[][] = [];
  let prev = start;
  for (let s = 0; s < values.length / c; s++) {
    prev = prev.map((ph, i) => ph + grayToStep(values[s * c + i]!) * step);
    syms.push(prev);
  }
  return syms;
}

export const SYNC_CARRIERS = SYNC_LAST - SYNC_FIRST + 1;
const headerSymbols = Math.ceil(((HEADER_BYTES + HEADER_PARITY) * 8) / SYNC_CARRIERS);

/** Number of symbols (sync + header + reference + payload) for a message of this size. */
export function frameSymbols(preset: BurstPreset, messageLength: number): number {
  const bits = payloadLength(messageLength, preset.parity) * 8;
  return 2 + headerSymbols + Math.ceil(bits / (carriers(preset) * preset.bitsPerSymbol));
}
export const frameSeconds = (preset: BurstPreset, messageLength: number) => (frameSymbols(preset, messageLength) * symbolSamples(preset)) / preset.sampleRate;

/** Turn a compressed batch into audio samples (mono, preset.sampleRate) for one frame. */
export function modulate(batch: Uint8Array, preset: BurstPreset, callSign: string): Float32Array {
  const { payload, messageLength } = encodePayload(batch, preset.parity);
  if (messageLength > 0xffffff) throw new Error('batch too large for one frame');
  const header = encodeHeader({ presetId: preset.id, messageLength, callSign });

  const sync = knownPhases(SYNC_SEED, SYNC_CARRIERS);
  const ref = knownPhases(REF_SEED, carriers(preset));
  const parts: Float64Array[] = [symbol(SYNC_FIRST, sync)];
  for (const ph of diffSymbols(sync, groups(header, 1, SYNC_CARRIERS), 1)) parts.push(symbol(SYNC_FIRST, ph));
  parts.push(symbol(preset.firstBin, ref));
  const values = groups(payload, preset.bitsPerSymbol, carriers(preset));
  for (const ph of diffSymbols(ref, values, preset.bitsPerSymbol)) parts.push(symbol(preset.firstBin, ph));

  const total = parts.reduce((n, p) => n + p.length, 0);
  const x = new Float64Array(total);
  let at = 0;
  for (const p of parts) {
    x.set(p, at);
    at += p.length;
  }
  let energy = 0;
  for (const v of x) energy += v * v;
  const gain = RMS / Math.sqrt(energy / total);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = Math.max(-CLIP, Math.min(CLIP, x[i]! * gain));
  return out;
}

export interface DecodedFrame extends FrameHeader {
  preset: string;
  batch: Uint8Array;
  /** Sample where the frame starts. */
  start: number;
  /** Sample just after the frame. */
  end: number;
  /** Reed-Solomon fixed at least one byte. */
  corrected: boolean;
}

/** Carrier values (complex) of the symbol whose useful part starts at `at`. */
function bins(x: Float32Array, at: number, first: number, count: number): [Float64Array, Float64Array] {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[at + i] ?? 0;
  fft(re, im);
  return [re.slice(first, first + count), im.slice(first, first + count)];
}

/** Differential demodulation of `count` symbols after a reference symbol, at `at` (useful part of the reference). */
function demodDiff(x: Float32Array, at: number, first: number, c: number, symbols: number, bits: number): number[] {
  const m = 1 << bits;
  const step = (2 * Math.PI) / m;
  let [pr, pi] = bins(x, at, first, c);
  const values: number[] = [];
  for (let s = 1; s <= symbols; s++) {
    const [cr, ci] = bins(x, at + s * (N + GUARD), first, c);
    for (let k = 0; k < c; k++) {
      // angle of current * conj(previous)
      const dr = cr[k]! * pr[k]! + ci[k]! * pi[k]!;
      const di = ci[k]! * pr[k]! - cr[k]! * pi[k]!;
      const d = Math.round(Math.atan2(di, dr) / step);
      values.push(stepToGray(((d % m) + m) % m));
    }
    pr = cr;
    pi = ci;
  }
  return values;
}

let syncTemplate: Float64Array | null = null;
function template(): Float64Array {
  return (syncTemplate ??= symbol(SYNC_FIRST, knownPhases(SYNC_SEED, SYNC_CARRIERS)).subarray(GUARD));
}

/**
 * Normalized correlation of the audio with the sync symbol at every lag
 * (overlap-save FFT), as values from 0 to 1.
 */
function syncCorrelation(x: Float32Array): Float32Array {
  const t = template();
  const L = 8192;
  const tr = new Float64Array(L);
  const ti = new Float64Array(L);
  tr.set(t);
  fft(tr, ti);
  let tEnergy = 0;
  for (const v of t) tEnergy += v * v;
  const prefix = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) prefix[i + 1] = prefix[i]! + x[i]! * x[i]!;
  const out = new Float32Array(Math.max(0, x.length - N + 1));
  const re = new Float64Array(L);
  const im = new Float64Array(L);
  for (let s = 0; s < out.length; s += L - N + 1) {
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < L && s + i < x.length; i++) re[i] = x[s + i]!;
    fft(re, im);
    for (let k = 0; k < L; k++) {
      // X * conj(T)
      const a = re[k]! * tr[k]! + im[k]! * ti[k]!;
      const b = im[k]! * tr[k]! - re[k]! * ti[k]!;
      re[k] = a;
      im[k] = b;
    }
    fft(re, im, true);
    for (let lag = 0; lag <= L - N && s + lag < out.length; lag++) {
      const e = prefix[s + lag + N]! - prefix[s + lag]!;
      out[s + lag] = e > 1e-12 ? Math.abs(re[lag]! / L) / Math.sqrt(e * tEnergy) : 0;
    }
  }
  return out;
}

/** Find and decode every frame in a recording (48 kHz mono). Frames that fail their checks are skipped. */
export function demodulate(x: Float32Array, threshold = 0.4): DecodedFrame[] {
  const corr = syncCorrelation(x);
  const frames: DecodedFrame[] = [];
  const hdrSyms = headerSymbols;
  const S = N + GUARD;
  for (let i = 0; i < corr.length; i++) {
    if (corr[i]! < threshold) continue;
    // The best peak within one symbol.
    let best = i;
    for (let j = i; j < Math.min(corr.length, i + S); j++) if (corr[j]! > corr[best]!) best = j;
    const at = Math.max(0, best - BACKOFF);
    const hv = demodDiff(x, at, SYNC_FIRST, SYNC_CARRIERS, hdrSyms, 1);
    const header = decodeHeader(ungroup(hv, 1, HEADER_BYTES + HEADER_PARITY));
    const preset = header && PRESETS.find((p) => p.id === header.presetId);
    if (!header || !preset) {
      i = best; // not a frame here; keep looking after this peak
      continue;
    }
    const c = carriers(preset);
    const plen = payloadLength(header.messageLength, preset.parity);
    const syms = Math.ceil((plen * 8) / (c * preset.bitsPerSymbol));
    const refAt = at + (1 + hdrSyms) * S;
    const end = best - GUARD + (2 + hdrSyms + syms) * S;
    if (refAt + syms * S + N > x.length + BACKOFF) break; // the recording stops mid-frame
    const pv = demodDiff(x, refAt, preset.firstBin, c, syms, preset.bitsPerSymbol);
    const result = decodePayload(ungroup(pv, preset.bitsPerSymbol, plen), header.messageLength, preset.parity);
    if (result) {
      frames.push({ ...header, preset: preset.name, batch: result.batch, corrected: result.corrected, start: best - GUARD, end });
      i = end - 1;
    } else {
      i = best;
    }
  }
  return frames;
}

export { SAMPLE_RATE };
