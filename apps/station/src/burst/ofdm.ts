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
import { codedBits, convDecode, convEncode, interleaver } from './conv.js';
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

/** Number of symbols (sync + header + reference + payload) for a message of this size. */
/** Bits on air for a payload: 8 per byte, or the inner code's coded bits. */
function airBits(preset: BurstPreset, payloadBytes: number): number {
  return preset.inner ? codedBits(payloadBytes, preset.inner) : payloadBytes * 8;
}

export function frameSymbols(preset: BurstPreset, messageLength: number): number {
  const bits = airBits(preset, payloadLength(messageLength, preset.parity));
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
  const values = preset.inner ? bitGroups(innerEncode(payload, preset), preset.bitsPerSymbol, carriers(preset)) : groups(payload, preset.bitsPerSymbol, carriers(preset));
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
  return values;
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
    const track: Track = { fresh: true, off: 0, rate: 0, bias: 0 };
    const hv = demodDiff(x, at, SYNC_FIRST, SYNC_CARRIERS, hdrSyms, 1, track);
    const header = decodeHeader(ungroup(hv, 1, HEADER_BYTES + HEADER_PARITY));
    const preset = header && PRESETS.find((p) => p.id === header.presetId);
    if (!header || !preset) {
      i = best; // not a frame here; keep looking after this peak
      continue;
    }
    const c = carriers(preset);
    const plen = payloadLength(header.messageLength, preset.parity);
    const syms = Math.ceil(airBits(preset, plen) / (c * preset.bitsPerSymbol));
    const refAt = at + (1 + hdrSyms) * S;
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
    const margins: number[] = [];
    const soft: number[] | undefined = preset.inner ? [] : undefined;
    const pv = demodDiff(src, srcAt, preset.firstBin, c, syms, preset.bitsPerSymbol, track, margins, soft);
    let result;
    if (preset.inner) {
      // Undo the scatter, then let the Viterbi decoder weigh every soft bit.
      const n = codedBits(plen, preset.inner);
      const perm = interleaver(n);
      let scale = 0;
      for (let i = 0; i < n; i++) scale += Math.abs(soft![i] ?? 0);
      scale = scale ? n / scale : 1;
      const llr = new Float32Array(n);
      for (let i = 0; i < n; i++) llr[i] = (soft![perm[i]!] ?? 0) * scale;
      result = decodePayload(convDecode(llr, plen, preset.inner), header.messageLength, preset.parity);
    } else {
      result = decodePayload(ungroup(pv, preset.bitsPerSymbol, plen), header.messageLength, preset.parity, byteMargins(margins, preset.bitsPerSymbol, plen));
    }
    const end = refAt + BACKOFF - GUARD + (syms + 1) * S + Math.round(track.off);
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
