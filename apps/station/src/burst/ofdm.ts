// The audio layer of a burst frame (docs/RADIO_BURST.md, "Waveform").
//
//   sync symbol      known phases on bins 16-63, for timing
//   header symbols   DBPSK on bins 16-63, referenced to the sync symbol
//   reference symbol known phases on the preset's carriers
//   payload symbols  differential PSK on the preset's carriers, or coherent
//                    QAM with pilot carriers on the "-qam" presets (qam.ts)
//
// Every symbol is fftSize samples with a cyclic prefix of `guard` samples.
// Sync and header use bins 16-63 (750-2953 Hz at 48 kHz) whatever the preset,
// so a receiver finds any frame with one search and learns the preset from the header.
import { fft } from './fft.js';
import { decodeHeader, decodePayload, encodeHeader, encodePayload, HEADER_BYTES, HEADER_PARITY, payloadLength, type FrameHeader } from './frame.js';
import { codedBits, convDecode, convEncode, interleaver } from './conv.js';
import { carriers, payloadCarriers, PRESETS, symbolSamples, type BurstPreset } from './presets.js';
import { isPilot, pilotPhase, qamPoint, qamSlice, qamSoft } from './qam.js';
import { finiteSamples } from './samples.js';

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
  return symbolIQ(
    firstBin,
    phases.map((ph) => Math.cos(ph)),
    phases.map((ph) => Math.sin(ph)),
  );
}

/** One OFDM symbol from complex carrier values (in-phase, quadrature) on bins firstBin.. */
function symbolIQ(firstBin: number, vr: number[], vi: number[]): Float64Array {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  vr.forEach((r, i) => {
    const k = firstBin + i;
    re[k] = r;
    im[k] = vi[i]!;
    re[N - k] = r;
    im[N - k] = -vi[i]!;
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

/** For each byte, the weakest margin among the symbols that carried its bits. */
function byteMargins(margins: number[], bits: number, byteCount: number): Float32Array {
  const out = new Float32Array(byteCount).fill(1);
  for (let g = 0; g < margins.length; g++) {
    for (let b = g * bits; b < (g + 1) * bits && b < byteCount * 8; b++) out[b >> 3] = Math.min(out[b >> 3]!, margins[g]!);
  }
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

/** Inner code: convolutional-code the payload, then scatter the coded bits. */
function innerEncode(payload: Uint8Array, preset: BurstPreset): Uint8Array {
  const coded = convEncode(payload, preset.inner!);
  const perm = interleaver(coded.length);
  const out = new Uint8Array(coded.length);
  for (let i = 0; i < coded.length; i++) out[perm[i]!] = coded[i]!;
  return out;
}

/** One-bit-per-entry array to groups of `bits`, zero padded to whole symbols. */
function bitGroups(bitArr: Uint8Array, bits: number, perSymbol: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < bitArr.length; i += bits) {
    let v = 0;
    for (let j = 0; j < bits; j++) v = (v << 1) | (bitArr[i + j] ?? 0);
    out.push(v);
  }
  while (out.length % perSymbol) out.push(0);
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
/**
 * HF presets (header: 'coded') send the same header bytes through the rate-1/2
 * convolutional code and the interleaver, so a notch from multipath or the top
 * of an SSB filter costs scattered soft bits instead of whole bytes. A receiver
 * that can't read a plain header tries this one on the same symbols.
 */
const HEADER_CODE = 'r12';
const codedHeaderSymbols = Math.ceil(codedBits(HEADER_BYTES + HEADER_PARITY, HEADER_CODE) / SYNC_CARRIERS);
const headerSymbolsFor = (preset: BurstPreset) => (preset.header === 'coded' ? codedHeaderSymbols : headerSymbols);

function codedHeader(header: Uint8Array): Uint8Array {
  const coded = convEncode(header, HEADER_CODE);
  const perm = interleaver(coded.length);
  const out = new Uint8Array(coded.length);
  for (let i = 0; i < coded.length; i++) out[perm[i]!] = coded[i]!;
  return out;
}

/** Number of symbols (sync + header + reference + payload) for a message of this size. */
/** Bits on air for a payload: 8 per byte, or the inner code's coded bits. */
function airBits(preset: BurstPreset, payloadBytes: number): number {
  return preset.inner ? codedBits(payloadBytes, preset.inner) : payloadBytes * 8;
}

/** Payload symbols for a payload of this many bytes. */
function payloadSymbols(preset: BurstPreset, payloadBytes: number): number {
  return Math.ceil(airBits(preset, payloadBytes) / (payloadCarriers(preset) * preset.bitsPerSymbol));
}

export function frameSymbols(preset: BurstPreset, messageLength: number): number {
  return 2 + headerSymbolsFor(preset) + payloadSymbols(preset, payloadLength(messageLength, preset.parity));
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
  const headerBits = preset.header === 'coded' ? bitGroups(codedHeader(header), 1, SYNC_CARRIERS) : groups(header, 1, SYNC_CARRIERS);
  for (const ph of diffSymbols(sync, headerBits, 1)) parts.push(symbol(SYNC_FIRST, ph));
  parts.push(symbol(preset.firstBin, ref));
  if (preset.modulation === 'qam') {
    const c = carriers(preset);
    const values = bitGroups(innerEncode(payload, preset), preset.bitsPerSymbol, payloadCarriers(preset));
    for (let s = 1, v = 0; v < values.length; s++) {
      const vr: number[] = [];
      const vi: number[] = [];
      for (let k = 0; k < c; k++) {
        const [r, i] = isPilot(k, c) ? [Math.cos(pilotPhase(ref, s, k)), Math.sin(pilotPhase(ref, s, k))] : qamPoint(values[v++]!, preset.bitsPerSymbol);
        vr.push(r);
        vi.push(i);
      }
      parts.push(symbolIQ(preset.firstBin, vr, vi));
    }
  } else {
    const values = preset.inner ? bitGroups(innerEncode(payload, preset), preset.bitsPerSymbol, carriers(preset)) : groups(payload, preset.bitsPerSymbol, carriers(preset));
    for (const ph of diffSymbols(ref, values, preset.bitsPerSymbol)) parts.push(symbol(preset.firstBin, ph));
  }

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
  /** Estimated signal-to-noise ratio in a 2.5 kHz bandwidth (the speed table's scale), from the payload. */
  snrDb: number;
}

/** Carrier values (complex) of the symbol whose useful part starts at `at`. */
function bins(x: Float32Array, at: number, first: number, count: number): [Float64Array, Float64Array] {
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[at + i] ?? 0;
  fft(re, im);
  return [re.slice(first, first + count), im.slice(first, first + count)];
}

/**
 * Receiver tracking, carried from the header into the payload:
 * off  = how far (in samples) the transmitter's clock has drifted from ours
 * rate = that drift per symbol
 * bias = the steady phase turn per symbol from a tuning offset (SSB) in radians
 * fresh = nothing measured yet
 */
interface Track {
  fresh: boolean;
  off: number;
  rate: number;
  bias: number;
  /** Payload signal and noise power per carrier, summed over symbols, for the frame's SNR estimate. */
  signal: number;
  noise: number;
}

/**
 * Differential demodulation of `symbols` symbols after a reference symbol whose
 * useful part starts at `at`. Decision-directed tracking: after each symbol,
 * the leftover phase error across carriers gives a slope (timing drift) and an
 * offset (tuning error); the FFT window follows the drift and the decisions
 * remove the offset.
 */
function demodDiff(
  x: Float32Array,
  at: number,
  first: number,
  c: number,
  symbols: number,
  bits: number,
  track: Track,
  margins?: number[],
  soft?: number[],
): number[] {
  const m = 1 << bits;
  const step = (2 * Math.PI) / m;
  const S = N + GUARD;
  let shift = Math.round(track.off);
  let [pr, pi] = bins(x, at + shift, first, c);
  const values: number[] = [];
  const err = new Float64Array(c);
  // Each decision's signal strength (|current x previous|), to mark faded symbols weak below.
  const marginsFrom = margins?.length ?? 0;
  const amps: number[] = [];
  const kMean = first + (c - 1) / 2;
  let kVar = 0;
  for (let k = 0; k < c; k++) kVar += (first + k - kMean) ** 2;
  for (let s = 1; s <= symbols; s++) {
    const nextShift = Math.round(track.off);
    const [cr, ci] = bins(x, at + s * S + nextShift, first, c);
    if (nextShift !== shift) {
      // A window moved by d samples turns bin k by 2*pi*k*d/N; turn the previous symbol to match.
      const d = nextShift - shift;
      for (let k = 0; k < c; k++) {
        const a = (2 * Math.PI * (first + k) * d) / N;
        const r = pr[k]! * Math.cos(a) - pi[k]! * Math.sin(a);
        pi[k] = pr[k]! * Math.sin(a) + pi[k]! * Math.cos(a);
        pr[k] = r;
      }
      shift = nextShift;
    }
    if (s === 1 && track.fresh) {
      // First symbol: estimate the tuning offset before any decision. Raising
      // each phase change to the power m wipes out the data and leaves m times
      // the offset (good for up to half a phase step either way).
      let sr = 0;
      let si = 0;
      for (let k = 0; k < c; k++) {
        const a = Math.atan2(ci[k]! * pr[k]! - cr[k]! * pi[k]!, cr[k]! * pr[k]! + ci[k]! * pi[k]!) * m;
        sr += Math.cos(a);
        si += Math.sin(a);
      }
      track.bias = Math.atan2(si, sr) / m;
      track.fresh = false;
    }
    let errMean = 0;
    for (let k = 0; k < c; k++) {
      // angle of current * conj(previous), less the tracked tuning offset
      const dr = cr[k]! * pr[k]! + ci[k]! * pi[k]!;
      const di = ci[k]! * pr[k]! - cr[k]! * pi[k]!;
      const ang = Math.atan2(di, dr) - track.bias;
      const d = Math.round(ang / step);
      values.push(stepToGray(((d % m) + m) % m));
      err[k] = ang - d * step;
      errMean += err[k]! / c;
      // How far inside its decision region the phase landed: 1 dead centre, 0 on the edge.
      margins?.push(1 - Math.min(1, Math.abs(err[k]!) / (step / 2)));
      if (margins) amps.push(Math.hypot(dr, di));
      if (soft) {
        // Max-log soft bits: for each bit of the Gray label, how much better the
        // phase change matches the closest step with that bit 0 than the closest
        // with it 1. Using the raw product (not just its angle) lets weak, faded
        // carriers count for less.
        for (let j = bits - 1; j >= 0; j--) {
          let d0 = Infinity;
          let d1 = Infinity;
          for (let sIdx = 0; sIdx < m; sIdx++) {
            const t = sIdx * step + track.bias;
            const d = -(dr * Math.cos(t) + di * Math.sin(t));
            if ((stepToGray(sIdx) >> j) & 1) d1 = Math.min(d1, d);
            else d0 = Math.min(d0, d);
          }
          soft.push(d1 - d0);
        }
      }
    }
    let slope = 0;
    for (let k = 0; k < c; k++) slope += ((first + k - kMean) * (err[k]! - errMean)) / kVar;
    // A phase change between two symbols each at signal-to-noise ratio g wanders by about 1/g radians squared.
    for (let k = 0; k < c; k++) track.noise += (err[k]! - errMean) ** 2;
    track.signal += c;
    // A clock difference makes each symbol arrive a little earlier or later
    // than the one before, which shows up as a phase slope of 2*pi*d/N radians
    // per bin (the window moves are already undone above). So the slope
    // measures the drift rate: smooth it, and move the window by it.
    track.rate += 0.15 * (-(slope * N) / (2 * Math.PI) - track.rate);
    track.off += track.rate;
    track.bias += 0.3 * errMean;
    pr = cr;
    pi = ci;
  }
  if (margins && amps.length) {
    // In a fade the phase is mostly noise, yet it can land near a decision point by chance and
    // look solid. Scale each margin by its strength against the frame's median, so a block the
    // Reed-Solomon code can't fix outright erases the faded bytes first (frame.ts).
    const median = [...amps].sort((a, b) => a - b)[amps.length >> 1]! || 1;
    for (let i = 0; i < amps.length; i++) margins[marginsFrom + i]! *= Math.min(1, amps[i]! / median);
  }
  return values;
}

/**
 * Coherent QAM payload (qam.ts). Per symbol: take out the frame's steady phase
 * slope across carriers (filter delay, measured on the reference symbol) and
 * any window moves, estimate each carrier's channel from the pilots, decide
 * the data, refine the estimate from the decided neighbours, then give soft
 * bits weighted by each carrier's signal-to-noise ratio. The pilots' phase
 * slope also tracks the sender's clock drift. Appends soft bits to `soft`.
 */
function demodQam(x: Float32Array, at: number, preset: BurstPreset, symbols: number, track: Track, soft: number[]): void {
  const first = preset.firstBin;
  const c = carriers(preset);
  const bits = preset.bitsPerSymbol;
  const ref = knownPhases(REF_SEED, c);
  const S = N + GUARD;
  const shiftRef = Math.round(track.off);
  // Steady phase step per carrier, from the reference symbol (all values known).
  const [r0, i0] = bins(x, at + shiftRef, first, c);
  let sr = 0;
  let si = 0;
  for (let k = 0; k + 1 < c; k++) {
    // (Y[k+1] / ref[k+1]) * conj(Y[k] / ref[k])
    const d = ref[k + 1]! - ref[k]!;
    const ar = r0[k + 1]! * r0[k]! + i0[k + 1]! * i0[k]!;
    const ai = i0[k + 1]! * r0[k]! - r0[k + 1]! * i0[k]!;
    sr += ar * Math.cos(d) + ai * Math.sin(d);
    si += ai * Math.cos(d) - ar * Math.sin(d);
  }
  const alpha = Math.atan2(si, sr);
  const F = 3;
  let noise = 0;
  let lastDelay = 0;
  const yr = new Float64Array(c);
  const yi = new Float64Array(c);
  const xr = new Float64Array(c);
  const xi = new Float64Array(c);
  const hr = new Float64Array(c);
  const hi = new Float64Array(c);
  const pilots: number[] = [];
  for (let k = 0; k < c; k++) if (isPilot(k, c)) pilots.push(k);
  for (let s = 1; s <= symbols; s++) {
    const shift = Math.round(track.off);
    const [br, bi] = bins(x, at + s * S + shift, first, c);
    for (let k = 0; k < c; k++) {
      const a = -alpha * k;
      yr[k] = br[k]! * Math.cos(a) - bi[k]! * Math.sin(a);
      yi[k] = br[k]! * Math.sin(a) + bi[k]! * Math.cos(a);
    }
    // Pilots: known values, so Y * conj(X) is the channel there.
    for (const k of pilots) {
      const p = pilotPhase(ref, s, k);
      xr[k] = Math.cos(p);
      xi[k] = Math.sin(p);
    }
    // Remaining slope across the pilots: the window's moves since the
    // reference, less how far the sender's clock has drifted. Following the
    // drift keeps it small, well inside what the pilot spacing can measure.
    let dr = 0;
    let di = 0;
    for (let j = 0; j + 1 < pilots.length; j++) {
      const a = pilots[j]!;
      const b = pilots[j + 1]!;
      const pa = [yr[a]! * xr[a]! + yi[a]! * xi[a]!, yi[a]! * xr[a]! - yr[a]! * xi[a]!];
      const pb = [yr[b]! * xr[b]! + yi[b]! * xi[b]!, yi[b]! * xr[b]! - yr[b]! * xi[b]!];
      const qr = pb[0]! * pa[0]! + pb[1]! * pa[1]!;
      const qi = pb[1]! * pa[0]! - pb[0]! * pa[1]!;
      const ang = Math.atan2(qi, qr) / (b - a);
      const w = Math.hypot(qr, qi);
      dr += w * Math.cos(ang);
      di += w * Math.sin(ang);
    }
    // A window moved d samples later turns carrier k by 2*pi*k*d/N; a signal arriving later, the other way.
    const delay = shift - shiftRef - (Math.atan2(di, dr) * N) / (2 * Math.PI);
    if (s > 1) track.rate += 0.15 * (delay - lastDelay - track.rate);
    lastDelay = delay;
    track.off = shiftRef + delay + track.rate;
    // First estimate: interpolate the pilots' channel across the data carriers.
    for (let j = 0; j + 1 < pilots.length; j++) {
      const a = pilots[j]!;
      const b = pilots[j + 1]!;
      const ar = yr[a]! * xr[a]! + yi[a]! * xi[a]!;
      const ai = yi[a]! * xr[a]! - yr[a]! * xi[a]!;
      const cr = yr[b]! * xr[b]! + yi[b]! * xi[b]!;
      const ci = yi[b]! * xr[b]! - yr[b]! * xi[b]!;
      for (let k = a; k <= b; k++) {
        const f = (k - a) / (b - a);
        hr[k] = ar * (1 - f) + cr * f;
        hi[k] = ai * (1 - f) + ci * f;
      }
    }
    // Decide the data against it, then re-estimate every carrier from its
    // neighbours (pilots and decided data, leaving itself out).
    for (let k = 0; k < c; k++) {
      if (isPilot(k, c)) continue;
      const g = hr[k]! ** 2 + hi[k]! ** 2 || 1e-12;
      const zr = (yr[k]! * hr[k]! + yi[k]! * hi[k]!) / g;
      const zi = (yi[k]! * hr[k]! - yr[k]! * hi[k]!) / g;
      [xr[k], xi[k]] = qamSlice(zr, zi, bits);
    }
    let resid = 0;
    for (let k = 0; k < c; k++) {
      let nr = 0;
      let ni = 0;
      let e = 0;
      for (let q = Math.max(0, k - F); q <= Math.min(c - 1, k + F); q++) {
        if (q === k) continue;
        nr += yr[q]! * xr[q]! + yi[q]! * xi[q]!;
        ni += yi[q]! * xr[q]! - yr[q]! * xi[q]!;
        e += xr[q]! ** 2 + xi[q]! ** 2;
      }
      hr[k] = nr / e;
      hi[k] = ni / e;
      resid += (yr[k]! - (hr[k]! * xr[k]! - hi[k]! * xi[k]!)) ** 2 + (yi[k]! - (hr[k]! * xi[k]! + hi[k]! * xr[k]!)) ** 2;
    }
    noise = s === 1 ? resid / c : 0.8 * noise + (0.2 * resid) / c;
    let power = 0;
    for (let k = 0; k < c; k++) power += hr[k]! ** 2 + hi[k]! ** 2;
    track.signal += power / c;
    // Each carrier's channel comes from its 2F neighbours, which adds about 1/(2F) to the residual.
    track.noise += resid / c / (1 + 1 / (2 * F));
    for (let k = 0; k < c; k++) {
      if (isPilot(k, c)) continue;
      const g = hr[k]! ** 2 + hi[k]! ** 2 || 1e-12;
      const zr = (yr[k]! * hr[k]! + yi[k]! * hi[k]!) / g;
      const zi = (yi[k]! * hr[k]! - yr[k]! * hi[k]!) / g;
      qamSoft(zr, zi, bits, g / (noise || 1e-12), soft);
    }
  }
}

/**
 * Signal-to-noise ratio in 2.5 kHz from the payload's per-carrier ratio (each
 * carrier is one FFT bin, SAMPLE_RATE / N hertz, wide), as dB.
 */
function frameSnr(track: Track, c: number): number {
  const perCarrier = track.signal / Math.max(track.noise, 1e-12);
  return 10 * Math.log10((perCarrier * c * (SAMPLE_RATE / N)) / 2500);
}

/** Shift every frequency in x by hz (via the analytic signal), as an SSB receiver's tuning knob would. */
function shiftFrequency(x: Float32Array, hz: number): Float32Array {
  let n = 1;
  while (n < x.length) n <<= 1;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  // Analytic signal: keep positive frequencies (doubled), drop negative ones.
  for (let k = 1; k < n / 2; k++) {
    re[k]! *= 2;
    im[k]! *= 2;
  }
  re.fill(0, n / 2 + 1);
  im.fill(0, n / 2 + 1);
  fft(re, im, true);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const a = (2 * Math.PI * hz * i) / SAMPLE_RATE;
    out[i] = (re[i]! * Math.cos(a) - im[i]! * Math.sin(a)) / n;
  }
  return out;
}

let syncTemplate: Float64Array | null = null;
let syncQuadrature: Float64Array | null = null;
function template(): Float64Array {
  return (syncTemplate ??= symbol(SYNC_FIRST, knownPhases(SYNC_SEED, SYNC_CARRIERS)).subarray(GUARD));
}

/** The sync symbol turned 90 degrees on every carrier (its Hilbert transform). */
function quadratureTemplate(): Float64Array {
  return (syncQuadrature ??= symbol(SYNC_FIRST, knownPhases(SYNC_SEED, SYNC_CARRIERS).map((ph) => ph - Math.PI / 2)).subarray(GUARD));
}

/**
 * Normalized correlation of the audio with the sync symbol at every lag
 * (overlap-save FFT), as values from 0 to 1. It correlates with the symbol and
 * its 90-degree turn and takes the magnitude, so a channel that rotates the
 * phase (an SSB receiver, HF multipath) finds the frame as well as FM audio.
 */
function syncCorrelation(x: Float32Array): Float32Array {
  const t = template();
  const q = quadratureTemplate();
  const L = 8192;
  const tr = new Float64Array(L);
  const ti = new Float64Array(L);
  const qr = new Float64Array(L);
  const qi = new Float64Array(L);
  tr.set(t);
  qr.set(q);
  fft(tr, ti);
  fft(qr, qi);
  let tEnergy = 0;
  for (const v of t) tEnergy += v * v;
  const prefix = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) prefix[i + 1] = prefix[i]! + x[i]! * x[i]!;
  const out = new Float32Array(Math.max(0, x.length - N + 1));
  const xr = new Float64Array(L);
  const xi = new Float64Array(L);
  const re = new Float64Array(L);
  const im = new Float64Array(L);
  for (let s = 0; s < out.length; s += L - N + 1) {
    xr.fill(0);
    xi.fill(0);
    for (let i = 0; i < L && s + i < x.length; i++) xr[i] = x[s + i]!;
    fft(xr, xi);
    // Real correlations with t and with q, packed as one complex inverse FFT:
    // IFFT(X conj(T) + j X conj(Q)) = corr_t + j corr_q, as both are real.
    for (let k = 0; k < L; k++) {
      const ar = xr[k]! * tr[k]! + xi[k]! * ti[k]!;
      const ai = xi[k]! * tr[k]! - xr[k]! * ti[k]!;
      const br = xr[k]! * qr[k]! + xi[k]! * qi[k]!;
      const bi = xi[k]! * qr[k]! - xr[k]! * qi[k]!;
      re[k] = ar - bi;
      im[k] = ai + br;
    }
    fft(re, im, true);
    for (let lag = 0; lag <= L - N && s + lag < out.length; lag++) {
      const e = prefix[s + lag + N]! - prefix[s + lag]!;
      out[s + lag] = e > 1e-12 ? Math.hypot(re[lag]!, im[lag]!) / L / Math.sqrt(e * tEnergy) : 0;
    }
  }
  return out;
}

/** Undo the interleaver's scatter of n soft bits, scaled so their mean size is 1. */
function deinterleave(soft: number[], n: number): Float32Array {
  const perm = interleaver(n);
  let scale = 0;
  for (let i = 0; i < n; i++) scale += Math.abs(soft[i] ?? 0);
  scale = scale ? n / scale : 1;
  const llr = new Float32Array(n);
  for (let i = 0; i < n; i++) llr[i] = (soft[perm[i]!] ?? 0) * scale;
  return llr;
}

/**
 * Find and decode every frame in a recording (48 kHz mono). Frames that fail
 * their checks are skipped. A receiver tuned up to about 5 Hz off is fine; on
 * HF (SSB), set searchHz to also try the audio moved in 10 Hz steps up to that
 * far either way (a 50 Hz search costs 11 passes).
 */
export function demodulate(audio: Float32Array, threshold = 0.4, searchHz = 0): DecodedFrame[] {
  const x = finiteSamples(audio);
  const frames = demodulateOnce(x, threshold);
  for (let hz = 10; hz <= searchHz; hz += 10) {
    for (const shift of [hz, -hz]) {
      for (const f of demodulateOnce(shiftFrequency(x, shift), threshold)) {
        if (!frames.some((g) => Math.abs(g.start - f.start) < N)) frames.push(f);
      }
    }
  }
  return frames.sort((a, b) => a.start - b.start);
}

function demodulateOnce(x: Float32Array, threshold: number): DecodedFrame[] {
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
    let track: Track = { fresh: true, off: 0, rate: 0, bias: 0, signal: 0, noise: 0 };
    const hv = demodDiff(x, at, SYNC_FIRST, SYNC_CARRIERS, hdrSyms, 1, track);
    let header = decodeHeader(ungroup(hv, 1, HEADER_BYTES + HEADER_PARITY));
    let preset = header && PRESETS.find((p) => p.id === header!.presetId && p.header !== 'coded');
    if (!header || !preset) {
      // An HF frame: the same symbols carry a convolutional-coded header.
      track = { fresh: true, off: 0, rate: 0, bias: 0, signal: 0, noise: 0 };
      const soft: number[] = [];
      demodDiff(x, at, SYNC_FIRST, SYNC_CARRIERS, codedHeaderSymbols, 1, track, undefined, soft);
      header = decodeHeader(convDecode(deinterleave(soft, codedBits(HEADER_BYTES + HEADER_PARITY, HEADER_CODE)), HEADER_BYTES + HEADER_PARITY, HEADER_CODE));
      preset = header && PRESETS.find((p) => p.id === header!.presetId && p.header === 'coded');
    }
    if (!header || !preset) {
      i = best; // not a frame here; keep looking after this peak
      continue;
    }
    const c = carriers(preset);
    const plen = payloadLength(header.messageLength, preset.parity);
    const syms = payloadSymbols(preset, plen);
    const refAt = at + (1 + headerSymbolsFor(preset)) * S;
    // The recording stops mid-frame (allowing for a sender whose clock runs up to 0.1% fast).
    if (refAt + (syms * S + N) * 0.999 > x.length + BACKOFF) break;
    // A tuning offset (SSB) also leaks energy between carriers; past a fraction
    // of a hertz, shift the frame back into tune before reading the payload.
    const offsetHz = (track.bias * SAMPLE_RATE) / (2 * Math.PI * S);
    let src = x;
    let srcAt = refAt;
    if (Math.abs(offsetHz) > 0.25) {
      const from = Math.max(0, refAt - S);
      src = shiftFrequency(x.subarray(from, Math.min(x.length, refAt + (syms + 2) * S + Math.ceil(syms * S * 0.001))), -offsetHz);
      srcAt = refAt - from;
      track.bias = 0;
    }
    track.signal = 0;
    track.noise = 0;
    const margins: number[] = [];
    const soft: number[] | undefined = preset.inner ? [] : undefined;
    let pv: number[] = [];
    if (preset.modulation === 'qam') demodQam(src, srcAt, preset, syms, track, soft!);
    else pv = demodDiff(src, srcAt, preset.firstBin, c, syms, preset.bitsPerSymbol, track, margins, soft);
    let result;
    if (preset.inner) {
      // Undo the scatter, then let the Viterbi decoder weigh every soft bit.
      result = decodePayload(convDecode(deinterleave(soft!, codedBits(plen, preset.inner)), plen, preset.inner), header.messageLength, preset.parity);
    } else {
      result = decodePayload(ungroup(pv, preset.bitsPerSymbol, plen), header.messageLength, preset.parity, byteMargins(margins, preset.bitsPerSymbol, plen));
    }
    const end = refAt + BACKOFF - GUARD + (syms + 1) * S + Math.round(track.off);
    if (result) {
      frames.push({ ...header, preset: preset.name, batch: result.batch, corrected: result.corrected, start: best - GUARD, end, snrDb: frameSnr(track, c) });
      i = end - 1;
    } else {
      i = best;
    }
  }
  return frames;
}

export { SAMPLE_RATE };
