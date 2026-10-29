// Burst mode: the compression, error correction, modem and station loop,
// end to end through a simulated radio channel.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBurst, listen, planFrames } from '../src/burst/burst.js';
import { decodeBatch, encodeBatch } from '../src/burst/codec.js';
import { fft } from '../src/burst/fft.js';
import { frameSeconds, modulate } from '../src/burst/ofdm.js';
import { PRESETS, presetByName } from '../src/burst/presets.js';
import { rsDecode, rsEncode } from '../src/burst/rs.js';
import { samplePrayers } from '../src/burst/sample.js';
import { decodeTextFrames, encodeTextFrame } from '../src/burst/text-frame.js';
import { simulateTransmitter, type BurstTransmitter } from '../src/burst/transmit.js';
import { fromWav, resample, toWav } from '../src/burst/wav.js';
import { runBurstOnce } from '../src/burst/worker.js';
import { DEFAULT_BLOCKLIST } from '../src/text.js';
import { httpApi, TransmitError, type ClaimedPrayer, type StationApi } from '../src/worker.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

/** Seeded random numbers, so a failing channel test fails the same way every run. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/**
 * A rough FM radio audio path: band-pass filtering, a level change, a sample
 * clock 100 ppm off from the transmitter's, white noise, and silence before
 * and after the burst.
 */
function radioChannel(x: Float32Array, o: { snrDb: number; lowHz: number; highHz: number; seed: number }): Float32Array {
  const rand = rng(o.seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const fs = 48_000;
  // Two cascaded one-pole high-pass and low-pass sections.
  const hp = Math.exp((-2 * Math.PI * o.lowHz) / fs);
  const lp = Math.exp((-2 * Math.PI * o.highHz) / fs);
  let h1 = 0, h1x = 0, h2 = 0, h2x = 0, l1 = 0, l2 = 0;
  const filtered = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    h1 = hp * (h1 + v - h1x);
    h1x = v;
    h2 = hp * (h2 + h1 - h2x);
    h2x = h1;
    l1 = (1 - lp) * h2 + lp * l1;
    l2 = (1 - lp) * l1 + lp * l2;
    filtered[i] = l2;
  }
  let energy = 0;
  for (const v of filtered) energy += v * v;
  const rms = Math.sqrt(energy / filtered.length) * 0.6;
  const noise = rms / 10 ** (o.snrDb / 20);
  const lead = 3000 + Math.floor(rand() * 5000);
  const out = new Float32Array(lead + Math.floor(x.length / 1.0001) + 6000);
  for (let i = 0; i < out.length; i++) {
    const t = (i - lead) * 1.0001;
    const a = Math.floor(t);
    const f = t - a;
    const v = a >= 0 && a + 1 < filtered.length ? filtered[a]! * (1 - f) + filtered[a + 1]! * f : 0;
    out[i] = 0.6 * v + noise * gauss();
  }
  return out;
}

/** Move every frequency by hz, as a mistuned SSB receiver would. */
function shiftForTest(x: Float32Array, hz: number): Float32Array {
  const n = 1 << Math.ceil(Math.log2(x.length));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(x);
  fft(re, im);
  const bins = Math.round(hz / (48_000 / n));
  const r2 = new Float64Array(n);
  const i2 = new Float64Array(n);
  for (let k = 1; k < n / 2; k++) {
    const t = k + bins;
    if (t <= 0 || t >= n / 2) continue;
    r2[t] = re[k]!;
    i2[t] = im[k]!;
    r2[n - t] = re[k]!;
    i2[n - t] = -im[k]!;
  }
  fft(r2, i2, true);
  return Float32Array.from(r2.subarray(0, x.length), (v) => v / n);
}

describe('Reed-Solomon', () => {
  it('corrects up to parity/2 bad bytes in any position', () => {
    const rand = rng(7);
    for (let t = 0; t < 200; t++) {
      const nsym = [16, 32, 48][t % 3]!;
      const data = Uint8Array.from({ length: 1 + Math.floor(rand() * (255 - nsym - 1)) }, () => Math.floor(rand() * 256));
      const block = rsEncode(data, nsym);
      const bad = new Set<number>();
      const count = Math.floor(rand() * (nsym / 2 + 1));
      while (bad.size < count) bad.add(Math.floor(rand() * block.length));
      for (const p of bad) block[p]! ^= 1 + Math.floor(rand() * 255);
      expect(Array.from(rsDecode(block, nsym) ?? [])).toEqual(Array.from(data));
    }
  });

  it('gives up (rather than inventing data) on a block with far too many errors', () => {
    const rand = rng(9);
    let wrong = 0;
    for (let t = 0; t < 100; t++) {
      const data = Uint8Array.from({ length: 200 }, () => Math.floor(rand() * 256));
      const block = rsEncode(data, 32);
      for (let i = 0; i < 60; i++) block[Math.floor(rand() * block.length)]! ^= 1 + Math.floor(rand() * 255);
      const out = rsDecode(block, 32);
      if (out && !out.every((v, i) => v === data[i])) wrong++;
    }
    // The frame's CRC-32 catches the rare miscorrection that slips through.
    expect(wrong).toBeLessThan(3);
  });
});

describe('batch compression', () => {
  it('round-trips and shrinks a batch of real-looking requests by more than 2.5x', () => {
    const batch = encodeBatch(SAMPLE_PRAYERS);
    expect(decodeBatch(batch)).toEqual(SAMPLE_PRAYERS);
    expect(SAMPLE_PRAYERS.join('\n').length / batch.length).toBeGreaterThan(2.5);
  });

  it('round-trips one short prayer and an empty batch', () => {
    expect(decodeBatch(encodeBatch(['Pray for Sam.']))).toEqual(['Pray for Sam.']);
    expect(decodeBatch(encodeBatch([]))).toEqual([]);
  });
});

describe('burst modem through a simulated FM radio', () => {
  const fmPresets = PRESETS.filter((p) => p.name.startsWith('fm-'));
  for (const preset of fmPresets) {
    it(`${preset.name}: 30 prayers survive filtering, clock drift and noise`, () => {
      const audio = modulate(encodeBatch(SAMPLE_PRAYERS), preset, 'KD9XYZ');
      const rx = radioChannel(audio, { snrDb: preset.bitsPerSymbol === 3 ? 22 : 15, lowHz: 300, highHz: 3400, seed: preset.id });
      const heard = listen(rx);
      expect(heard).toHaveLength(1);
      expect(heard[0]).toMatchObject({ callSign: 'KD9XYZ', preset: preset.name, prayers: SAMPLE_PRAYERS });
    });
  }

  it('dataport-fast: 30 prayers through a flat data port in under a second', () => {
    const preset = presetByName('dataport-fast');
    const batch = encodeBatch(SAMPLE_PRAYERS);
    expect(frameSeconds(preset, batch.length + 4)).toBeLessThan(1);
    const rx = radioChannel(modulate(batch, preset, 'KD9XYZ'), { snrDb: 24, lowHz: 50, highHz: 7000, seed: 4 });
    expect(listen(rx)[0]?.prayers).toEqual(SAMPLE_PRAYERS);
  });

  it('fm-fast: a long frame (over 12 s) survives a 300 ppm sound card clock difference', () => {
    const preset = presetByName('fm-fast');
    const prayers = samplePrayers(1500, 5);
    const [batch] = planFrames(prayers, preset, 20);
    const audio = modulate(batch!, preset, 'KD9XYZ');
    expect(audio.length / 48_000).toBeGreaterThan(12);
    for (const ratio of [1.0003, 0.9997]) {
      const rx = new Float32Array(Math.floor(audio.length / ratio));
      for (let i = 0; i < rx.length; i++) {
        const t = i * ratio;
        const a = Math.floor(t);
        rx[i] = (audio[a] ?? 0) * (1 - (t - a)) + (audio[a + 1] ?? 0) * (t - a);
      }
      expect(listen(rx)).toHaveLength(1);
    }
  });

  it('fm-fast: survives an SSB receiver tuned 8 Hz off', () => {
    const preset = presetByName('fm-fast');
    const audio = modulate(encodeBatch(SAMPLE_PRAYERS), preset, 'KD9XYZ');
    for (const hz of [8, -8]) expect(listen(shiftForTest(audio, hz))[0]?.prayers).toEqual(SAMPLE_PRAYERS);
  });

  it('fm-fast: 30 prayers take under 2 seconds of air time', () => {
    expect(frameSeconds(presetByName('fm-fast'), encodeBatch(SAMPLE_PRAYERS).length + 4)).toBeLessThan(2);
  });

  it('decodes nothing from noise alone, and nothing from a recording cut off mid-frame', () => {
    const rand = rng(3);
    expect(listen(Float32Array.from({ length: 96_000 }, () => (rand() - 0.5) * 0.3))).toEqual([]);
    const audio = modulate(encodeBatch(SAMPLE_PRAYERS), presetByName('fm-standard'), 'KD9XYZ');
    expect(listen(audio.subarray(0, Math.floor(audio.length / 2)))).toEqual([]);
  });

  it('splits a big batch into frames that each stay under the limit, and a receiver gets every prayer in order', () => {
    const preset = presetByName('fm-standard');
    const prayers = samplePrayers(200);
    const batches = planFrames(prayers, preset, 3);
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(frameSeconds(preset, b.length + 4)).toBeLessThanOrEqual(3);
    const burst = buildBurst(batches, preset, 'KD9XYZ');
    const heard = listen(radioChannel(burst.audio, { snrDb: 18, lowHz: 300, highHz: 3400, seed: 11 }));
    expect(heard.flatMap((h) => h.prayers)).toEqual(prayers);
  });

  it('survives a trip through a 16-bit WAV file recorded at 44.1 kHz', () => {
    const preset = presetByName('fm-standard');
    const burst = buildBurst([encodeBatch(SAMPLE_PRAYERS.slice(0, 8))], preset, 'KD9XYZ');
    const wav = fromWav(toWav(resample(burst.audio, 48_000, 44_100), 44_100));
    expect(wav.sampleRate).toBe(44_100);
    expect(listen(resample(wav.samples, 44_100, 48_000))[0]?.prayers).toEqual(SAMPLE_PRAYERS.slice(0, 8));
  });
});

describe('fldigi text frames', () => {
  it('round-trips through received text and drops a corrupted line', () => {
    const good = encodeTextFrame(encodeBatch(SAMPLE_PRAYERS.slice(0, 3)), 'kd9xyz');
    const bad = encodeTextFrame(encodeBatch(['Pray for Ana.']), 'KD9XYZ').replace(/.(.{6})$/, 'Q$1');
    const frames = decodeTextFrames(`noise ${good} more noise\n${bad}\n`);
    expect(frames).toHaveLength(1);
    expect(frames[0]!.callSign).toBe('KD9XYZ');
    expect(decodeBatch(frames[0]!.batch)).toEqual(SAMPLE_PRAYERS.slice(0, 3));
  });
});

function fakeApi(queue: ClaimedPrayer[]) {
  const reports: { id: string; ok: boolean; pieces?: number; error?: string }[] = [];
  const api: StationApi = {
    claim: async () => queue.shift() ?? null,
    claimBatch: async (max) => queue.splice(0, max),
    report: async (id, r) => void reports.push({ id, ...r }),
  };
  return { api, reports };
}

const cfg = { callSign: 'N0CALL', preset: presetByName('fm-standard'), maxPrayers: 50, maxFrameSeconds: 20, blocklist: DEFAULT_BLOCKLIST };
const quiet = () => undefined;

describe('burst station loop', () => {
  it('sends a batch in one burst, reports every prayer, and a receiver hears them all (simulate mode)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'burst-'));
    const lines: string[] = [];
    const { api, reports } = fakeApi([
      { id: 'a', text: 'Pray for Señor Núñez.' },
      { id: 'b', text: 'Pray for this shit to end' },
      { id: 'c', text: 'Pray for peace.', repeats: 3 },
    ]);
    const outcome = await runBurstOnce(api, simulateTransmitter(dir, (m) => lines.push(m)), cfg, quiet);
    expect(outcome).toMatchObject({ kind: 'sent', sent: 2, rejected: 1, frames: 1 });
    expect(reports).toEqual([
      { id: 'b', ok: false, callSign: 'N0CALL', error: 'rejected by station content filter' },
      { id: 'a', ok: true, callSign: 'N0CALL', pieces: 1 },
      { id: 'c', ok: true, callSign: 'N0CALL', pieces: 1 },
    ]);
    const wavs = readdirSync(dir);
    expect(wavs).toHaveLength(1);
    const wav = fromWav(readFileSync(path.join(dir, wavs[0]!)));
    expect(listen(wav.samples)[0]?.prayers).toEqual(['Pray for Senor Nunez.', 'Pray for peace.', 'Pray for peace.', 'Pray for peace.']);
    expect(lines.some((l) => l.includes('a receiver decodes 4 prayer(s)'))).toBe(true);
  });

  it('is idle with nothing queued', async () => {
    const { api } = fakeApi([]);
    expect(await runBurstOnce(api, simulateTransmitter(mkdtempSync(path.join(tmpdir(), 'burst-')), quiet), cfg, quiet)).toEqual({ kind: 'idle' });
  });

  it('on a transmit failure unkeys, reports every prayer as failed and stops', async () => {
    let stopped = false;
    const tx: BurstTransmitter = {
      send: async () => {
        throw new Error('sound card busy');
      },
      stop: async () => void (stopped = true),
    };
    const { api, reports } = fakeApi([{ id: 'a', text: 'Pray for Ana.' }, { id: 'b', text: 'Pray for Ben.' }]);
    await expect(runBurstOnce(api, tx, cfg, quiet, [])).rejects.toBeInstanceOf(TransmitError);
    expect(stopped).toBe(true);
    expect(reports).toEqual([
      { id: 'a', ok: false, callSign: 'N0CALL', error: 'sound card busy' },
      { id: 'b', ok: false, callSign: 'N0CALL', error: 'sound card busy' },
    ]);
  });

  it('claims one at a time from a server without burst claims', async () => {
    const queue = [{ id: 'a', text: 'one' }, { id: 'b', text: 'two' }, { id: 'c', text: 'three' }];
    const fetchImpl = (async (url: string) => {
      if (url.endsWith('/station/claim-batch')) return new Response('', { status: 404 });
      const next = queue.shift();
      return next ? Response.json({ radioPrayer: next }) : new Response(null, { status: 204 });
    }) as typeof fetch;
    expect((await httpApi('http://x', 'k', fetchImpl).claimBatch!(2)).map((p) => p.id)).toEqual(['a', 'b']);
  });
});
