// Real-world receive conditions a listener's sound card and radio produce:
// too quiet, overdriven, mains hum and a DC offset, a dropout of broken
// samples, two stations keying up over each other, bursts back to back. The
// decoder must get every prayer it can, never mix two stations' prayers, and
// never print a prayer that wasn't sent.
import { describe, expect, it } from 'vitest';
import { buildBurst, listen, planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { fromWav, resample } from '../src/burst/wav.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

const RATE = 48_000;
const p = presetByName('fm-standard');
const sentA = SAMPLE_PRAYERS.slice(0, 6);
const sentB = SAMPLE_PRAYERS.slice(6, 12);
const burstA = buildBurst(planFrames(sentA, p, 0.6), p, 'N0CALL').audio;
const burstB = buildBurst(planFrames(sentB, p, 0.6), p, 'K0GIN').audio;

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
/** Pads a burst with a little noise either side, as a receiver records it. */
function onAir(audio: Float32Array, noise = 0.002, seed = 1): Float32Array {
  const r = rng(seed);
  const pad = RATE / 4;
  const out = Float32Array.from({ length: audio.length + 2 * pad }, () => noise * gauss(r));
  for (let i = 0; i < audio.length; i++) out[pad + i] = out[pad + i]! + audio[i]!;
  return out;
}
const heard = (audio: Float32Array) => listen(audio).flatMap((h) => h.prayers.map((prayer) => ({ callSign: h.callSign, prayer })));
const prayersFrom = (audio: Float32Array, callSign: string) => heard(audio).filter((h) => h.callSign === callSign).map((h) => h.prayer);

describe('receive robustness', () => {
  it('decodes a burst recorded far too quietly (about -50 dBFS)', () => {
    const quiet = onAir(burstA.map((s) => s * 0.003), 0.00002);
    expect(prayersFrom(quiet, 'N0CALL')).toEqual(sentA);
  });

  it('decodes a burst the receiver overdrove into hard clipping', () => {
    const hot = onAir(burstA).map((s) => Math.max(-1, Math.min(1, s * 8)));
    for (const h of heard(hot)) expect(sentA).toContain(h.prayer);
    expect(prayersFrom(hot, 'N0CALL').length).toBeGreaterThan(0);
  });

  it('decodes through 60 Hz mains hum and a DC offset from a cheap sound card', () => {
    const a = onAir(burstA);
    const humming = a.map((s, i) => s + 0.15 * Math.sin((2 * Math.PI * 60 * i) / RATE) + 0.2);
    expect(prayersFrom(humming, 'N0CALL')).toEqual(sentA);
  });

  it('a short dropout of broken samples (NaN, Infinity) mid-burst costs nothing: every prayer still decodes, quickly', () => {
    const a = onAir(burstA);
    const at = Math.floor(a.length / 2);
    for (let i = at; i < at + 300; i++) a[i] = i % 2 ? NaN : Infinity;
    const t = Date.now();
    expect(prayersFrom(a, 'N0CALL')).toEqual(sentA);
    expect(Date.now() - t).toBeLessThan(2_000);
  });

  it('two stations keying up over each other: never a prayer from one credited to the other', () => {
    const offset = Math.floor(burstA.length / 3);
    const both = new Float32Array(Math.max(burstA.length, offset + burstB.length));
    both.set(burstA);
    for (let i = 0; i < burstB.length; i++) both[offset + i] = both[offset + i]! + burstB[i]!;
    for (const h of heard(onAir(both))) {
      expect(h.callSign === 'N0CALL' ? sentA : sentB).toContain(h.prayer);
    }
  });

  it('two bursts back to back with only a short gap: both are heard, each from its own station', () => {
    const gap = new Float32Array(RATE / 10);
    const seq = new Float32Array(burstA.length + gap.length + burstB.length);
    seq.set(burstA);
    seq.set(burstB, burstA.length + gap.length);
    const audio = onAir(seq);
    expect(prayersFrom(audio, 'N0CALL')).toEqual(sentA);
    expect(prayersFrom(audio, 'K0GIN')).toEqual(sentB);
  });
});

/** A WAV as recorders and Audacity save one: `bits` PCM or float, `channels` interleaved, the same audio in each. */
function wav(x: Float32Array, rate: number, bits: number, float: boolean, channels: number): Buffer {
  const width = bits / 8;
  const data = Buffer.alloc(x.length * width * channels);
  for (let i = 0; i < x.length; i++) {
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * width;
      const v = Math.max(-1, Math.min(1 - 2 ** -(bits - 1), x[i]!));
      if (float) {
        if (bits === 32) data.writeFloatLE(v, p);
        else data.writeDoubleLE(v, p);
      } else if (bits === 24) data.writeIntLE(Math.round(v * 8388608), p, 3);
      else data.writeInt32LE(Math.round(v * 2147483648), p);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVEfmt ', 8, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(float ? 3 : 1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * width * channels, 28);
  h.writeUInt16LE(width * channels, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

describe('recordings in the formats receivers save', () => {
  const at441 = resample(onAir(burstA), RATE, 44_100);
  for (const [name, bits, float, channels] of [
    ['24-bit stereo', 24, false, 2],
    ['32-bit float', 32, true, 1],
    ['64-bit float', 64, true, 1],
  ] as const) {
    it(`decodes a ${name} WAV at 44.1 kHz`, () => {
      const r = fromWav(wav(at441, 44_100, bits, float, channels));
      expect(r.sampleRate).toBe(44_100);
      expect(prayersFrom(resample(r.samples, 44_100, RATE), 'N0CALL')).toEqual(sentA);
    });
  }

  it('refuses a broken or compressed WAV with a clear message', () => {
    const ok = wav(new Float32Array(100), RATE, 24, false, 1);
    const noChannels = Buffer.from(ok);
    noChannels.writeUInt16LE(0, 22);
    expect(() => fromWav(noChannels)).toThrow(/broken format header/);
    const adpcm = Buffer.from(ok);
    adpcm.writeUInt16LE(2, 20);
    expect(() => fromWav(adpcm)).toThrow(/unsupported WAV encoding 2/);
    const odd = Buffer.from(ok);
    odd.writeUInt16LE(12, 34);
    expect(() => fromWav(odd)).toThrow(/sample size 12/);
  });
});
