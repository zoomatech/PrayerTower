// The prayer panel and SSTV (Robot 36), in practice mode: a batch of prayers packed into one
// picture, read back from noisy SSTV audio (noise, a radio tuned off, a sound card's clock
// running fast) and from a simulated camera photo (tilted, turned over, unevenly lit, soft,
// grainy). A panel that can't be read says nothing; it never prints a prayer that wasn't sent.
import { describe, expect, it } from 'vitest';
import { decodeBatch } from '../src/burst/codec.js';
import { resample } from '../src/burst/wav.js';
import { decodeCells, decodePanelImage, encodePanel, GRID_H, GRID_W, maxBatchBytes, panelImage } from '../src/panel/panel.js';
import { decodeRobot36, encodeRobot36, HEIGHT, WIDTH } from '../src/panel/sstv.js';
import { runSstvOnce, SSTV_PRESET } from '../src/panel/worker.js';
import { fingerprint } from '../src/burst/sha256.js';
import type { BurstTransmitter } from '../src/burst/transmit.js';
import type { StationApi } from '../src/worker.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

const RATE = 48_000;
const panel = encodePanel(SAMPLE_PRAYERS, 'N0CALL');
const sent = SAMPLE_PRAYERS.slice(0, panel.count);
const picture = panelImage(panel.cells, 4);
const audio = encodeRobot36(picture.gray, RATE);

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());

/** The picture as a receiver records it: a second of noise either side, noise throughout. */
function onAir(signal: Float32Array, noise: number, seed = 1): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(signal.length + 2 * RATE);
  for (let i = 0; i < out.length; i++) out[i] = (i >= RATE && i < RATE + signal.length ? signal[i - RATE]! : 0) + noise * gauss(r);
  return out;
}

/** The same audio with every tone moved by `hz` (an SSB radio tuned off), by re-synthesising its frequency track. */
function shifted(signal: Float32Array, hz: number): Float32Array {
  const out = new Float32Array(signal.length);
  // A single-sideband shift: the analytic signal times e^(i 2 pi hz t), built with a Hilbert FIR.
  const taps = 101;
  const h = new Float32Array(taps);
  for (let k = 0; k < taps; k++) {
    const n = k - (taps - 1) / 2;
    h[k] = n === 0 || n % 2 === 0 ? 0 : (2 / (Math.PI * n)) * (0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (taps - 1)));
  }
  const d = (taps - 1) / 2;
  for (let i = 0; i < signal.length; i++) {
    let q = 0;
    for (let k = 0; k < taps; k++) {
      const j = i - k + d;
      if (j >= 0 && j < signal.length) q += h[k]! * signal[j]!;
    }
    const a = (2 * Math.PI * hz * i) / RATE;
    out[i] = signal[i]! * Math.cos(a) - q * Math.sin(a);
  }
  return out;
}

function prayersOf(frame: { batch: Uint8Array } | null) {
  return frame ? decodeBatch(frame.batch) : null;
}

describe('the prayer panel', () => {
  it('packs a batch of prayers into one 80 x 60 grid, framed for a camera', () => {
    expect(maxBatchBytes()).toBeGreaterThan(380);
    expect(panel.count).toBeGreaterThanOrEqual(12);
    expect(panel.cells).toHaveLength(GRID_W * GRID_H);
    // White quiet zone, then a black frame two cells wide.
    expect(panel.cells[0]).toBe(0);
    expect(panel.cells[GRID_W + 1]).toBe(1);
    expect(panel.cells[2 * GRID_W + 2]).toBe(1);
    // Whitened: data is about half black.
    const ones = panel.cells.reduce((n, c) => n + c, 0) / panel.cells.length;
    expect(ones).toBeGreaterThan(0.4);
    expect(ones).toBeLessThan(0.65);
    expect(prayersOf(decodeCells(panel.cells))).toEqual(sent);
    expect(decodeCells(panel.cells)?.callSign).toBe('N0CALL');
  });

  it('corrects damaged cells, and refuses a panel damaged beyond repair', () => {
    const r = rng(3);
    const hurt = panel.cells.slice();
    for (let i = 0; i < 20; i++) {
      const x = 3 + Math.floor(r() * (GRID_W - 6));
      const y = 3 + Math.floor(r() * (GRID_H - 6));
      hurt[y * GRID_W + x] = hurt[y * GRID_W + x]! ^ 1;
    }
    const fixed = decodeCells(hurt);
    expect(fixed?.corrected).toBe(true);
    expect(prayersOf(fixed)).toEqual(sent);
    const ruined = panel.cells.map((c, i) => (i % 3 ? c : c ^ 1));
    expect(decodeCells(ruined)).toBeNull();
  });

  it('reads a simulated camera photo: tilted in perspective, turned over, unevenly lit, soft and grainy', () => {
    const big = panelImage(panel.cells, 8);
    const W = 900;
    const H = 700;
    // Where the panel's corners land in the photo (upside down: its top-left is at the bottom right).
    const quad: [number, number][] = [
      [790, 610],
      [110, 650],
      [150, 70],
      [760, 120],
    ];
    const r = rng(9);
    const photo = new Uint8Array(W * H);
    // Inverse map: for each photo pixel, the panel pixel it shows (a camera's perspective is a homography).
    const toPanel = inverse(squareToQuad(quad));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const [u, v] = project(toPanel, x + 0.5, y + 0.5);
        let value = 200; // a light table around the panel
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const px = Math.min(big.width - 1, Math.floor(u * big.width));
          const py = Math.min(big.height - 1, Math.floor(v * big.height));
          value = big.gray[py * big.width + px]! ? 235 : 35;
        }
        const light = 0.75 + 0.35 * (x / W) - 0.15 * (y / H);
        photo[y * W + x] = Math.max(0, Math.min(255, Math.round(value * light + 10 * gauss(r))));
      }
    }
    const soft = blur(photo, W, H);
    const frame = decodePanelImage(soft, W, H);
    expect(frame?.callSign).toBe('N0CALL');
    expect(prayersOf(frame)).toEqual(sent);
  });

  it('finds nothing in a picture with no panel', () => {
    const r = rng(5);
    const noise = Uint8Array.from({ length: 320 * 240 }, () => Math.floor(r() * 256));
    expect(decodePanelImage(noise, 320, 240)).toBeNull();
    expect(decodePanelImage(new Uint8Array(320 * 240).fill(255), 320, 240)).toBeNull();
  });
});

describe('SSTV Robot 36', () => {
  it('is 320 x 240 and about 37 seconds with its VIS header', () => {
    expect([WIDTH, HEIGHT]).toEqual([320, 240]);
    expect(audio.length / RATE).toBeCloseTo(0.61 + 0.3 + 240 * 0.15, 1);
  });

  it.each([
    ['clean', 0],
    ['noisy (about +10 dB in a 3 kHz channel)', 0.3],
    ['very noisy (about +6 dB in a 3 kHz channel)', 0.45],
  ])('reads the panel back from %s audio', (_name, noise) => {
    const pic = decodeRobot36(onAir(audio, noise), RATE);
    expect(pic).not.toBeNull();
    expect(pic!.lines).toBeGreaterThan(220);
    expect(pic!.start / RATE).toBeCloseTo(1 + 0.91, 1);
    expect(prayersOf(decodePanelImage(pic!.gray, WIDTH, HEIGHT))).toEqual(sent);
  });

  it('reads it from a radio tuned 60 Hz off and a sound card whose clock runs 0.05% fast', () => {
    const off = shifted(audio, 60);
    expect(prayersOf(decodePanelImage(decodeRobot36(onAir(off, 0.1), RATE)!.gray, WIDTH, HEIGHT))).toEqual(sent);
    const fast = resample(onAir(audio, 0.1, 2), RATE, RATE * 1.0005);
    expect(prayersOf(decodePanelImage(decodeRobot36(fast, RATE)!.gray, WIDTH, HEIGHT))).toEqual(sent);
  });

  it('says nothing for noise, or for a picture cut short', () => {
    const r = rng(11);
    expect(decodeRobot36(Float32Array.from({ length: RATE * 40 }, () => 0.3 * gauss(r)), RATE)).toBeNull();
    expect(decodeRobot36(onAir(audio.subarray(0, Math.floor(audio.length / 2)), 0.01), RATE)).toBeNull();
  });

  it('decodes at the listener apps’ other common rate', () => {
    const at44 = resample(onAir(audio, 0.05), RATE, 44_100);
    expect(prayersOf(decodePanelImage(decodeRobot36(at44, 44_100)!.gray, WIDTH, HEIGHT))).toEqual(sent);
  });
});

describe('BURST_MODE=sstv on the station', () => {
  function station(claimed: { id: string; text: string }[]) {
    const reports: { id: string; r: Record<string, unknown> }[] = [];
    const modes: (string | undefined)[] = [];
    const api: StationApi = {
      claim: async () => null,
      claimBatch: async (_max, mode) => (modes.push(mode), claimed),
      report: async (id, r) => void reports.push({ id, r }),
    };
    const played: Float32Array[] = [];
    const tx: BurstTransmitter = { mode: 'audio', send: async () => ({ frames: 0, seconds: 0, bytes: 0, decoded: null }), stop: async () => {}, sendAudio: async (a) => void played.push(a) };
    return { api, tx, reports, modes, played };
  }

  it('claims in panel mode, sends as many panels as the batch needs, and reports each prayer with its fingerprint', async () => {
    const claimed = [...SAMPLE_PRAYERS, ...SAMPLE_PRAYERS.map((p) => `${p} Again.`)].map((text, i) => ({ id: `p${i}`, text }));
    const s = station(claimed);
    const out = await runSstvOnce(s.api, s.tx, { callSign: 'N0CALL', maxPrayers: 100, blocklist: ['curse'] }, () => undefined);
    expect(s.modes).toEqual(['panel']);
    expect(out).toMatchObject({ kind: 'sent', sent: claimed.length });
    expect(s.played.length).toBeGreaterThanOrEqual(3);
    // Every panel decodes, and together they carry every prayer once, in order.
    const heard = s.played.flatMap((a) => prayersOf(decodePanelImage(decodeRobot36(onAir(a, 0.1), RATE)!.gray, WIDTH, HEIGHT)) ?? []);
    expect(heard).toEqual(claimed.map((c) => c.text));
    expect(s.reports).toHaveLength(claimed.length);
    expect(s.reports[0]).toEqual({ id: 'p0', r: { ok: true, callSign: 'N0CALL', pieces: 1, preset: SSTV_PRESET, sentHash: fingerprint(claimed[0]!.text), frequencyHz: undefined } });
  });

  it('keeps a prayer the content filter refuses off the air', async () => {
    const s = station([{ id: 'bad', text: 'A curse on them' }]);
    expect(await runSstvOnce(s.api, s.tx, { callSign: 'N0CALL', maxPrayers: 10, blocklist: ['curse'] }, () => undefined)).toEqual({ kind: 'rejected', rejected: 1 });
    expect(s.played).toHaveLength(0);
    expect(s.reports[0]!.r).toMatchObject({ ok: false });
  });
});

/** The homography taking the unit square's corners to the quad's (Heckbert, "Fundamentals of Texture Mapping", 1989). */
function squareToQuad(q: [number, number][]): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]];
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** The inverse of a 3 x 3 matrix (row by row). */
function inverse(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

function project(m: number[], x: number, y: number): [number, number] {
  const w = m[6]! * x + m[7]! * y + m[8]!;
  return [(m[0]! * x + m[1]! * y + m[2]!) / w, (m[3]! * x + m[4]! * y + m[5]!) / w];
}

/** A 3 x 3 box blur: an out-of-focus lens. */
function blur(img: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(img.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          s += img[yy * w + xx]!;
          n++;
        }
      }
      out[y * w + x] = Math.round(s / n);
    }
  }
  return out;
}
