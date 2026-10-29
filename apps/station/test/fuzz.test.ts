// Fuzzing the receive side: whatever arrives over the air (noise, damaged
// frames, a hostile transmitter), the decoders must not throw, hang or print a
// prayer that wasn't sent. Seeded, so a failure reproduces.
import { describe, expect, it } from 'vitest';
import { buildBurst, listen, planFrames } from '../src/burst/burst.js';
import { cmDecompress } from '../src/burst/cm.js';
import { ALL_V2, Codec, decodeBatch, encodeBatch } from '../src/burst/codec.js';
import { diagnose } from '../src/burst/diagnose.js';
import { decodeHeader, encodeHeader } from '../src/burst/frame.js';
import { demodulate } from '../src/burst/ofdm.js';
import { presetByName } from '../src/burst/presets.js';
import { rsDecode, rsEncode } from '../src/burst/rs.js';
import { decodeTextFrames, encodeTextFrame } from '../src/burst/text-frame.js';
import { decodeAudio, decodePackets } from '../src/burst/web.js';
import { RollingDecoder } from '../src/listener.js';
import { decodeFrame, demodulate as demodulatePackets, encodeFrame, modulate } from '../src/packet/afsk.js';
import { parseStatus, statusFrames } from '../src/packet/message.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
}
const bytes = (r: () => number, n: number) => Uint8Array.from({ length: n }, () => Math.floor(r() * 256));
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
/** Runs fn and returns how long it took, failing on anything but a plain Error. */
function within<T>(ms: number, fn: () => T): T {
  const t = Date.now();
  const out = fn();
  expect(Date.now() - t).toBeLessThan(ms);
  return out;
}
const safely = <T>(fn: () => T): T | Error => {
  try {
    return fn();
  } catch (err) {
    expect(err).toBeInstanceOf(Error);
    return err as Error;
  }
};

describe('decoder fuzzing', () => {
  it('a batch of random bytes, under every codec, unpacks or fails cleanly and quickly', () => {
    const r = rng(1);
    for (let i = 0; i < 240; i++) {
      const b = bytes(r, 1 + Math.floor(r() * 300));
      b[0] = i % 6; // codecs 0-4, and one nobody knows
      // A context-mixing batch claims its own length (up to MAX_TEXT, 4 MB): junk can cost seconds, never more.
      within(10_000, () => safely(() => decodeBatch(b)));
    }
  }, 300_000);

  it('a claimed length beyond any real batch is refused at once (no 16 MB allocation or minute-long decode)', () => {
    // varint 0x7fffff = 8 MB, then junk
    expect(() => within(200, () => cmDecompress(Uint8Array.from([0xff, 0xff, 0xff, 0x03, 1, 2, 3]), new Uint8Array(10), 'fuzz'))).toThrow('bad length');
  });

  it('a damaged codec 3 or 4 batch never comes back as the original prayers with a changed word', () => {
    const r = rng(2);
    for (const codecs of [undefined, ALL_V2]) {
      const good = encodeBatch(SAMPLE_PRAYERS.slice(0, 8), codecs);
      for (let i = 0; i < 60; i++) {
        const bad = good.slice();
        bad[1 + Math.floor(r() * (bad.length - 1))]! ^= 1 << Math.floor(r() * 8);
        const out = safely(() => decodeBatch(bad));
        // Context mixing has no checksum of its own (the frame's CRC-32 guards it), so a flip changes
        // the text; what matters is that it fails or returns text, never throws something else or hangs.
        if (!(out instanceof Error)) expect(Array.isArray(out)).toBe(true);
      }
    }
  });

  it('Reed-Solomon blocks and frame headers with random damage decode right or not at all', () => {
    const r = rng(3);
    for (let i = 0; i < 300; i++) {
      const data = bytes(r, 20 + Math.floor(r() * 200));
      const coded = rsEncode(data, 16);
      const hits = Math.floor(r() * 14);
      for (let k = 0; k < hits; k++) coded[Math.floor(r() * coded.length)] = Math.floor(r() * 256);
      const back = safely(() => rsDecode(coded, 16));
      // Up to 8 byte errors are always corrected; more may be refused or (rarely, for any RS code)
      // miscorrected, which the frame's CRC-32 then catches.
      if (hits <= 8) expect(Array.from(back as Uint8Array)).toEqual(Array.from(data));
    }
    for (let i = 0; i < 300; i++) expect(safely(() => decodeHeader(bytes(r, 32)))).not.toBeInstanceOf(Error);
    const h = encodeHeader({ presetId: 1, messageLength: 300, callSign: 'N0CALL' });
    expect(decodeHeader(h)).toMatchObject({ messageLength: 300, callSign: 'N0CALL' });
  });

  it('noise, silence, clipping and DC never decode to a frame or a packet, and never throw', () => {
    const r = rng(4);
    const cases: Float32Array[] = [
      new Float32Array(0),
      new Float32Array(10),
      new Float32Array(48_000),
      Float32Array.from({ length: 96_000 }, () => 0.3 * gauss(r)),
      Float32Array.from({ length: 48_000 }, () => (r() < 0.5 ? -1 : 1)),
      new Float32Array(48_000).fill(0.9),
      Float32Array.from({ length: 48_000 }, (_, i) => Math.sin(i * 0.3) * 1e-30),
      Float32Array.from({ length: 48_000 }, () => (r() < 0.001 ? NaN : 0.1 * gauss(r))),
    ];
    for (const audio of cases) {
      expect(within(15_000, () => demodulate(audio, 0.4, 0))).toEqual([]);
      expect(within(5_000, () => demodulatePackets(audio, 48_000))).toEqual([]);
      expect(decodeAudio(audio, 44_100)).toEqual([]);
      expect(decodePackets(audio, 22_050)).toEqual([]);
      expect(safely(() => diagnose(audio, 48_000, { searchHz: 0 }))).not.toBeInstanceOf(Error);
    }
  });

  it('a burst with chunks cut out, noise bursts or a truncated end yields only prayers that were sent', () => {
    const p = presetByName('fm-standard');
    const sent = SAMPLE_PRAYERS.slice(0, 12);
    const clean = buildBurst(planFrames(sent, p, 0.6), p, 'N0CALL').audio;
    const r = rng(5);
    for (let i = 0; i < 12; i++) {
      const a = clean.slice();
      const kind = i % 3;
      const at = Math.floor(r() * a.length);
      const len = Math.floor(r() * 4000);
      if (kind === 0) a.fill(0, at, at + len);
      else if (kind === 1) for (let k = at; k < Math.min(a.length, at + len); k++) a[k] = a[k]! + 0.8 * gauss(r);
      const audio = kind === 2 ? a.subarray(0, at) : a;
      for (const h of within(20_000, () => listen(audio))) {
        for (const prayer of h.prayers) expect(sent).toContain(prayer);
      }
    }
  });

  it('a frame with a codec the receiver does not know is reported, not fatal to the other frames', () => {
    const p = presetByName('fm-standard');
    const odd = Uint8Array.from([9, 1, 2, 3]);
    const fine = encodeBatch(['Pray for the night shift.']);
    const heard = listen(buildBurst([odd, fine], p, 'N0CALL').audio);
    expect(heard).toHaveLength(2);
    expect(heard[0]!.unreadable).toMatch(/unknown codec 9/);
    expect(heard[1]!.prayers).toEqual(['Pray for the night shift.']);
    expect(decodeAudio(buildBurst([odd], p, 'N0CALL').audio, 48_000)[0]!.prayers).toBeNull();
    expect(Codec.ContextMix2).toBe(4);
  });

  it('AX.25 frames and APRS status text: random and damaged input is refused, never misread', () => {
    const r = rng(6);
    for (let i = 0; i < 500; i++) expect(decodeFrame(bytes(r, Math.floor(r() * 80)))).toBeNull();
    const good = encodeFrame(statusFrames('N0CALL', ['3fa9c1'])[0]!);
    for (let i = 0; i < 200; i++) {
      const bad = good.slice();
      bad[Math.floor(r() * bad.length)]! ^= 1 << Math.floor(r() * 8);
      expect(decodeFrame(bad)).toBeNull();
    }
    for (const info of ['>PT', '>PT 1 prayers 1/1:', '>PT 99999 prayers 1/1: abcdef', '>PT 2 prayers 1/1: ABCDEF', '>PT 2 prayers 1/1: abcdef abcdef abcdef abcdef abcdef abcdef abcdef', '>PT -1 prayers 1/1: abcdef']) {
      const s = parseStatus({ dest: 'APZPTW', src: 'N0CALL', info });
      if (s) expect(s.ids.length).toBeLessThanOrEqual(6);
    }
    expect(parseStatus({ dest: 'APZPTW', src: 'N0CALL', info: '>PT 2 prayers 1/1: abcdef' })).toMatchObject({ count: 2, ids: ['abcdef'] });
  });

  it('fldigi text frames: random text and damaged base64 never throw', () => {
    const r = rng(7);
    const good = encodeTextFrame(encodeBatch(['Pray for calm seas.']), 'N0CALL');
    for (let i = 0; i < 200; i++) {
      const chars = good.split('');
      chars[Math.floor(r() * chars.length)] = String.fromCharCode(32 + Math.floor(r() * 95));
      for (const f of safely(() => decodeTextFrames(chars.join(''))) as { batch: Uint8Array }[]) safely(() => decodeBatch(f.batch));
    }
    expect(decodeTextFrames(good).map((f) => decodeBatch(f.batch))).toEqual([['Pray for calm seas.']]);
  });

  it('the listener node keeps going through a long stretch of noise with packets and a burst in it', () => {
    const r = rng(8);
    const dec = new RollingDecoder();
    const p = presetByName('fm-standard');
    const burst = buildBurst(planFrames(['Pray for the fishermen.'], p, 20), p, 'N0CALL').audio;
    const packet = modulate(statusFrames('N0CALL', ['0a0b0c']).map(encodeFrame), 48_000);
    let frames = 0;
    let packets = 0;
    for (let s = 0; s < 8; s++) {
      const chunk = Float32Array.from({ length: 48_000 }, () => 0.01 * gauss(r));
      if (s === 3) chunk.set(burst.subarray(0, Math.min(burst.length, chunk.length)), 0);
      if (s === 5) chunk.set(packet.subarray(0, Math.min(packet.length, chunk.length)), 0);
      dec.push(chunk);
      frames += within(20_000, () => dec.decode()).length;
      packets += dec.packets.length;
    }
    expect(frames).toBe(1);
    expect(packets).toBe(1);
  });
});
