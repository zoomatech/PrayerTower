// SSTV, Robot 36 (docs/RADIO_BURST.md, "Prayer panel"): the prayer panel sent as an ordinary
// slow-scan television picture, so any SSTV receiver shows it and the listener apps read it.
// Timings from the Dayton Paper (JL Barber, N7CXI, "Proposal for SSTV Mode Specifications"):
//
//   VIS: 1900 Hz 300 ms, 1200 Hz 10 ms, 1900 Hz 300 ms, start bit 1200 Hz 30 ms, seven bits
//   (code 8) least significant first at 30 ms each (1100 Hz = 1, 1300 Hz = 0), even parity bit,
//   stop bit 1200 Hz 30 ms.
//   Each of 240 lines (150 ms): sync 1200 Hz 9 ms, porch 1500 Hz 3 ms, Y 88 ms (320 pixels,
//   1500 Hz black to 2300 Hz white), separator 4.5 ms (1500 Hz even lines, 2300 Hz odd),
//   porch 1900 Hz 1.5 ms, then R-Y (even) or B-Y (odd) 44 ms (160 pixels).
//
// The panel is black and white, so the colour scans carry the neutral 1900 Hz and the decoder
// reads only Y. No Node APIs: the listener apps decode with this too.

export const WIDTH = 320;
export const HEIGHT = 240;
export const VIS_ROBOT36 = 8;
const LINE_MS = 150;
const SYNC_MS = 9;
const Y_START_MS = 12;
const Y_MS = 88;
const BLACK = 1500;
const WHITE = 2300;
const SYNC = 1200;

/** Robot 36 audio for a 320 x 240 grayscale picture (0 black .. 255 white), VIS header first. */
export function encodeRobot36(gray: Uint8Array, rate = 48_000, amplitude = 0.5): Float32Array {
  const parts: [hz: number | ((t: number) => number), ms: number][] = [
    [1900, 300],
    [SYNC, 10],
    [1900, 300],
    [SYNC, 30],
  ];
  let ones = 0;
  for (let b = 0; b < 7; b++) {
    const bit = (VIS_ROBOT36 >> b) & 1;
    ones += bit;
    parts.push([bit ? 1100 : 1300, 30]);
  }
  parts.push([ones % 2 ? 1100 : 1300, 30], [SYNC, 30]);
  const pixel = (row: number) => (t: number) => {
    const x = Math.min(WIDTH - 1, Math.floor((t / Y_MS) * WIDTH));
    return BLACK + ((WHITE - BLACK) * gray[row * WIDTH + x]!) / 255;
  };
  for (let y = 0; y < HEIGHT; y++) {
    parts.push([SYNC, SYNC_MS], [BLACK, 3], [pixel(y), Y_MS], [y % 2 ? WHITE : BLACK, 4.5], [1900, 1.5], [1900, 44]);
  }
  const total = Math.round((parts.reduce((n, [, ms]) => n + ms, 0) / 1000) * rate);
  const out = new Float32Array(total);
  let phase = 0;
  let at = 0;
  let elapsedMs = 0;
  for (const [hz, ms] of parts) {
    const end = Math.round(((elapsedMs + ms) / 1000) * rate);
    for (let i = at; i < end; i++) {
      const t = (i / rate) * 1000 - elapsedMs;
      const f = typeof hz === 'number' ? hz : hz(t);
      phase += (2 * Math.PI * f) / rate;
      out[i] = amplitude * Math.sin(phase);
    }
    phase %= 2 * Math.PI;
    at = end;
    elapsedMs += ms;
  }
  return out;
}

/** Average of `n` samples at a time, run twice: a gentle low-pass. */
function smooth(x: Float32Array, n: number): Float32Array {
  if (n <= 1) return x;
  let out = x;
  for (let pass = 0; pass < 2; pass++) {
    const src = out;
    const dst = new Float32Array(src.length);
    let acc = 0;
    for (let i = 0; i < src.length; i++) {
      acc += src[i]!;
      if (i >= n) acc -= src[i - n]!;
      dst[i] = acc / Math.min(i + 1, n);
    }
    // Undo the half-window delay.
    const shift = Math.floor((n - 1) / 2);
    out = new Float32Array(src.length);
    out.set(dst.subarray(shift));
  }
  return out;
}

/** The instantaneous frequency of the audio, in Hz, sample by sample (an FM discriminator around 1700 Hz). */
export function instantFrequency(samples: Float32Array, rate: number): Float32Array {
  const fc = 1700;
  const n = samples.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * fc * i) / rate;
    re[i] = samples[i]! * Math.cos(a);
    im[i] = -samples[i]! * Math.sin(a);
  }
  // The mixer's image sits near 3400 Hz: an average over that period removes it.
  const w = Math.max(1, Math.round(rate / 3400));
  const r = smooth(re, w);
  const q = smooth(im, w);
  const f = new Float32Array(n);
  for (let i = 1; i < n; i++) {
    const dPhase = Math.atan2(q[i]! * r[i - 1]! - r[i]! * q[i - 1]!, r[i]! * r[i - 1]! + q[i]! * q[i - 1]!);
    f[i] = fc + (dPhase * rate) / (2 * Math.PI);
  }
  f[0] = f[1] ?? fc;
  return smooth(f, Math.max(1, Math.round(rate / 4000)));
}

/** Down to about 12 kHz (an average of each group), which is plenty for tones under 2.4 kHz. */
function decimate(samples: Float32Array, rate: number): { x: Float32Array; rate: number } {
  const k = Math.max(1, Math.floor(rate / 12_000));
  if (k === 1) return { x: samples, rate };
  const x = new Float32Array(Math.floor(samples.length / k));
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += samples[i * k + j]!;
    x[i] = s / k;
  }
  return { x, rate: rate / k };
}

export interface SstvPicture {
  /** 320 x 240, 0 black .. 255 white (Y only). */
  gray: Uint8Array;
  /** Where the picture's first line starts and its last ends, in samples of the audio given. */
  start: number;
  end: number;
  /** Line syncs found, of 240. */
  lines: number;
}

/**
 * Find a Robot 36 picture in the audio and read its brightness. Needs most of the picture
 * (at least 200 of its 240 line syncs); allows a radio tuned up to about 100 Hz off.
 */
export function decodeRobot36(samples: Float32Array, inputRate: number): SstvPicture | null {
  const { x, rate } = decimate(samples, inputRate);
  const freq = instantFrequency(x, rate);
  const ms = rate / 1000;
  // Sync pulses: at least 6 ms below 1350 Hz (a 9 ms line sync; the VIS's 30 ms bits are left out),
  // looked for in the frequency averaged over 2 ms so noise doesn't break a pulse up.
  const slow = smooth(freq, Math.max(1, Math.round(2 * ms)));
  // A pulse is the last 9 ms of a low run: the VIS header runs straight into line 0's sync.
  const syncs: number[] = [];
  let runStart = -1;
  for (let i = 0; i < slow.length; i++) {
    const low = slow[i]! < 1350;
    if (low && runStart < 0) runStart = i;
    if (!low && runStart >= 0) {
      if (i - runStart >= 5 * ms) syncs.push(Math.max(runStart, i - SYNC_MS * ms));
      runStart = -1;
    }
  }
  if (syncs.length < 200) return null;
  const period = LINE_MS * ms;
  const tol = 2.5 * ms;
  // The chain of syncs a line apart with the most members, then a straight-line fit through it.
  // Each line is looked for a period after the last one found, so a sound card's clock that runs
  // a little fast or slow still makes one chain.
  const chain = (first: number, step: number) => {
    const hits: [k: number, at: number][] = [];
    let j = 0;
    let lastK = 0;
    let lastAt = first;
    for (let k = 0; k < HEIGHT; k++) {
      const want = lastAt + (k - lastK) * step;
      while (j < syncs.length && syncs[j]! < want - tol) j++;
      if (j < syncs.length && Math.abs(syncs[j]! - want) <= tol) {
        hits.push([k, syncs[j]!]);
        lastK = k;
        lastAt = syncs[j]!;
      }
    }
    return hits;
  };
  let best: [number, number][] = [];
  for (const s of syncs) {
    const hits = chain(s, period);
    if (hits.length > best.length) best = hits;
    if (best.length >= HEIGHT - 2) break;
  }
  if (best.length < 200) return null;
  let a = best[0]![1];
  let b = period;
  for (let round = 0; round < 2; round++) {
    const n = best.length;
    const mk = best.reduce((s, [k]) => s + k, 0) / n;
    const mt = best.reduce((s, [, t]) => s + t, 0) / n;
    const cov = best.reduce((s, [k, t]) => s + (k - mk) * (t - mt), 0);
    const vk = best.reduce((s, [k]) => s + (k - mk) ** 2, 0);
    b = vk ? cov / vk : period;
    a = mt - b * mk;
    best = chain(a, b);
  }
  // A radio tuned off moves every tone: the syncs say by how much.
  let offset = 0;
  let count = 0;
  for (const [, t] of best) {
    for (let i = Math.round(t + 2 * ms); i < t + 7 * ms && i < freq.length; i++) {
      offset += freq[i]! - SYNC;
      count++;
    }
  }
  offset = count ? offset / count : 0;
  if (Math.abs(offset) > 120) return null;
  const gray = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const lineStart = a + y * b;
    for (let px = 0; px < WIDTH; px++) {
      const from = Math.round(lineStart + (Y_START_MS + (px * Y_MS) / WIDTH) * ms);
      const to = Math.max(from + 1, Math.round(lineStart + (Y_START_MS + ((px + 1) * Y_MS) / WIDTH) * ms));
      let s = 0;
      let n = 0;
      for (let i = from; i < to && i < freq.length; i++) {
        if (i < 0) continue;
        s += freq[i]! - offset;
        n++;
      }
      const f = n ? s / n : BLACK;
      gray[y * WIDTH + px] = Math.max(0, Math.min(255, Math.round(((f - BLACK) / (WHITE - BLACK)) * 255)));
    }
  }
  const k = inputRate / rate;
  return { gray, start: Math.round(a * k), end: Math.round((a + HEIGHT * b) * k), lines: best.length };
}
