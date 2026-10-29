// A simulated HF (shortwave) SSB path for testing the hf- presets: the
// Watterson model, with the CCIR Rec. 520 test channels HF modems are
// compared on (docs/RADIO_BURST.md, "HF presets"). Two equal-power
// paths, the second delayed, each faded by its own complex Gaussian process
// with a Gaussian Doppler spectrum; then a mistuned receiver, a 300-2700 Hz
// SSB filter and white noise at a given SNR in 2.5 kHz.
import { fft } from './fft.js';

export interface HfChannel {
  /** SNR in a 2,500 Hz bandwidth, dB. */
  snrDb: number;
  /** Delay of the second path, ms (0 = one path, flat fading). */
  delayMs: number;
  /** Doppler spread (two-sigma width of each path's Gaussian spectrum), Hz. 0 = no fading. */
  dopplerHz: number;
  /** Receiver tuning error, Hz. */
  offsetHz: number;
  /** SSB filter edges, Hz. */
  lowHz: number;
  highHz: number;
  seed: number;
}

/** CCIR Rec. 520 test channels (two equal paths), plus a quiet one with no fading. */
export const HF_CHANNELS = {
  quiet: { delayMs: 0, dopplerHz: 0 },
  moderate: { delayMs: 1, dopplerHz: 0.5 },
  poor: { delayMs: 2, dopplerHz: 1 },
} as const;

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** Sum-of-sinusoids fading tap with a Gaussian Doppler spectrum and unit mean power. */
function fadingTap(rand: () => number, dopplerHz: number, rate: number, length: number): [Float32Array, Float32Array] {
  const re = new Float32Array(length);
  const im = new Float32Array(length);
  if (dopplerHz <= 0) {
    const ph = 2 * Math.PI * rand();
    re.fill(Math.cos(ph));
    im.fill(Math.sin(ph));
    return [re, im];
  }
  const M = 24;
  const sigma = dopplerHz / 2;
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const f = Array.from({ length: M }, () => sigma * gauss());
  const ph = Array.from({ length: M }, () => 2 * Math.PI * rand());
  const step = 64; // the taps change slowly: compute every 64 samples and hold
  for (let i = 0; i < length; i += step) {
    const t = i / rate;
    let r = 0;
    let q = 0;
    for (let m = 0; m < M; m++) {
      const a = 2 * Math.PI * f[m]! * t + ph[m]!;
      r += Math.cos(a);
      q += Math.sin(a);
    }
    re.fill(r / Math.sqrt(M), i, i + step);
    im.fill(q / Math.sqrt(M), i, i + step);
  }
  return [re, im];
}

/** Pass real audio x (48 kHz) through the simulated HF path. Adds 0.25 s of noise before and after. */
export function hfChannel(x: Float32Array, c: HfChannel, rate = 48_000): Float32Array {
  const rand = rng(c.seed);
  const pad = Math.round(rate / 4);
  const n = 1 << Math.ceil(Math.log2(x.length + 2 * pad));
  // Analytic signal of the input.
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x, pad);
  fft(re, im);
  for (let k = n / 2 + 1; k < n; k++) re[k] = im[k] = 0;
  for (let k = 1; k < n / 2; k++) {
    re[k]! *= 2;
    im[k]! *= 2;
  }
  fft(re, im, true);
  for (let i = 0; i < n; i++) {
    re[i]! /= n;
    im[i]! /= n;
  }
  // Two faded paths and the tuning offset.
  const delay = Math.round((c.delayMs / 1000) * rate);
  const paths = delay > 0 ? 2 : 1;
  const taps = Array.from({ length: paths }, () => fadingTap(rand, c.dopplerHz, rate, n));
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  const norm = 1 / Math.sqrt(paths);
  for (let i = 0; i < n; i++) {
    let r = 0;
    let q = 0;
    for (let p = 0; p < paths; p++) {
      const j = i - p * delay;
      if (j < 0) continue;
      const [tr, ti] = taps[p]!;
      r += tr[i]! * re[j]! - ti[i]! * im[j]!;
      q += tr[i]! * im[j]! + ti[i]! * re[j]!;
    }
    const a = (2 * Math.PI * c.offsetHz * i) / rate;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    outRe[i] = norm * (r * ca - q * sa);
    outIm[i] = 0;
  }
  // Signal power before the noise (the faded average, which is the input's).
  let power = 0;
  for (let i = pad; i < pad + x.length; i++) power += x[i - pad]! * x[i - pad]!;
  power /= Math.max(1, x.length);
  // White noise whose power in 2.5 kHz sets the SNR, then the SSB filter on both.
  const noiseVar = (power / 10 ** (c.snrDb / 10)) * (rate / 2 / 2500);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  for (let i = 0; i < n; i++) outRe[i]! += Math.sqrt(noiseVar) * gauss();
  fft(outRe, outIm);
  const lo = Math.round((c.lowHz / rate) * n);
  const hi = Math.round((c.highHz / rate) * n);
  for (let k = 0; k <= n / 2; k++) {
    if (k >= lo && k <= hi) continue;
    outRe[k] = outIm[k] = 0;
    if (k > 0) outRe[n - k] = outIm[n - k] = 0;
  }
  fft(outRe, outIm, true);
  return Float32Array.from(outRe.subarray(0, x.length + 2 * pad), (v) => v / n);
}
