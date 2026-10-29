import { describe, expect, it } from 'vitest';
import { fingerprint } from '../src/burst/sha256.js';
import type { BurstTransmitter } from '../src/burst/transmit.js';
import { listenOnce, RollingDecoder, type ListenerApi } from '../src/listener.js';
import { decodeFrame, demodulate, encodeFrame, fcs, hdlcBits, modulate } from '../src/packet/afsk.js';
import { parseStatus, statusFrames } from '../src/packet/message.js';
import { runPacketOnce } from '../src/packet/worker.js';
import type { StationApi } from '../src/worker.js';

const noisy = (audio: Float32Array, snrDb: number, seed = 7) => {
  let x = seed;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  // Noise power relative to the tone's (amplitude 0.5), over the whole 24 kHz band.
  const sigma = 0.5 / Math.SQRT2 / 10 ** (snrDb / 20);
  return Float32Array.from(audio, (v) => v + sigma * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));
};

describe('1200-baud packet (Bell 202 AFSK, AX.25)', () => {
  it('computes the AX.25 FCS (CRC-16/X.25 check value 0x906E)', () => {
    expect(fcs(new TextEncoder().encode('123456789'))).toBe(0x906e);
  });

  it('encodes a UI frame and reads it back; a damaged frame fails its FCS', () => {
    const bytes = encodeFrame({ dest: 'APZPTW', src: 'N0CALL-9', path: ['WIDE1-1'], info: '>hello' });
    // Destination first, shifted left one bit, then UI control 0x03 and PID 0xF0.
    expect(bytes[0]).toBe('A'.charCodeAt(0) << 1);
    expect(bytes[6]! & 0x80).toBe(0x80);
    expect(bytes[20]! & 1).toBe(1);
    expect([bytes[21], bytes[22]]).toEqual([0x03, 0xf0]);
    expect(decodeFrame(bytes)).toEqual({ dest: 'APZPTW', src: 'N0CALL-9', path: ['WIDE1-1'], info: '>hello' });
    const bad = bytes.slice();
    bad[25] = bad[25]! ^ 1;
    expect(decodeFrame(bad)).toBeNull();
    expect(() => encodeFrame({ dest: 'APZPTW', src: 'TOOLONGCALL', info: 'x' })).toThrow(/AX.25/);
  });

  it('stuffs a 0 after five 1s, never inside flags', () => {
    const bits = hdlcBits([Uint8Array.from([0xff])], 1, 1);
    expect(bits.slice(8, 17)).toEqual([1, 1, 1, 1, 1, 0, 1, 1, 1]);
    expect(bits.slice(0, 8)).toEqual([0, 1, 1, 1, 1, 1, 1, 0]);
  });

  it('carries the count and up to six short IDs per status packet', () => {
    const ids = ['3fa9c1', '07b2de', '9c44e0', 'a1b2c3', 'd4e5f6', '0a0b0c', '112233'];
    const frames = statusFrames('N0CALL', ids);
    expect(frames.map((f) => f.info)).toEqual(['>PT 7 prayers 1/2: 3fa9c1 07b2de 9c44e0 a1b2c3 d4e5f6 0a0b0c', '>PT 7 prayers 2/2: 112233']);
    expect(parseStatus(frames[1]!)).toEqual({ callSign: 'N0CALL', count: 7, page: 2, pages: 2, ids: ['112233'] });
    expect(parseStatus({ dest: 'APRS', src: 'N0CALL', info: frames[0]!.info })).toBeNull();
  });

  it('decodes its own audio at 48 and 44.1 kHz, and through noise', () => {
    const frames = statusFrames('N0CALL-9', ['3fa9c1', '07b2de', '9c44e0', 'a1b2c3', 'd4e5f6', '0a0b0c', '112233'], ['WIDE1-1']).map(encodeFrame);
    for (const rate of [48_000, 44_100]) expect(demodulate(modulate(frames, rate), rate).map((d) => d.frame.info)).toHaveLength(2);
    expect(demodulate(noisy(modulate(frames), 3)).map((d) => parseStatus(d.frame)?.page)).toEqual([1, 2]);
    // Pure noise yields nothing (the FCS drops it).
    expect(demodulate(noisy(new Float32Array(48_000), -10))).toEqual([]);
  });
});

describe('packet fallback on the station and a listener', () => {
  const prayers = [{ id: 'p1', text: 'Healing for Ana' }, { id: 'p2', text: 'Peace in the Lee home' }];
  function station(claimed = prayers) {
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

  it('claims in packet mode, sends IDs (never words) and reports each prayer with its fingerprint', async () => {
    const s = station();
    const out = await runPacketOnce(s.api, s.tx, { callSign: 'N0CALL', maxPrayers: 50, blocklist: [], path: [] }, () => undefined);
    expect(out).toMatchObject({ kind: 'sent', sent: 2, packets: 1 });
    expect(s.modes).toEqual(['packet']);
    const heard = demodulate(s.played[0]!).map((d) => d.frame);
    expect(heard[0]!.info).toBe(`>PT 2 prayers 1/1: ${fingerprint('Healing for Ana').slice(0, 6)} ${fingerprint('Peace in the Lee home').slice(0, 6)}`);
    expect(JSON.stringify(heard)).not.toContain('Ana');
    expect(s.reports.map((r) => r.r)).toEqual([
      { ok: true, callSign: 'N0CALL', pieces: 1, preset: 'aprs-1200', sentHash: fingerprint('Healing for Ana'), frequencyHz: undefined },
      { ok: true, callSign: 'N0CALL', pieces: 1, preset: 'aprs-1200', sentHash: fingerprint('Peace in the Lee home'), frequencyHz: undefined },
    ]);
  });

  it('a listener node reports the short IDs it decoded', async () => {
    const s = station();
    await runPacketOnce(s.api, s.tx, { callSign: 'N0CALL', maxPrayers: 50, blocklist: [], path: [] }, () => undefined);
    const ids: { callSign: string; ids: string[] }[] = [];
    const api: ListenerApi = { channelReport: async () => {}, heard: async () => {}, heartbeat: async () => {}, heardIds: async (r) => void ids.push(r) };
    const dec = new RollingDecoder();
    dec.push(new Float32Array([...new Float32Array(4800), ...s.played[0]!, ...new Float32Array(4800)]));
    await listenOnce(dec, api, { searchHz: 0, receipts: true }, () => undefined);
    expect(ids).toEqual([{ callSign: 'N0CALL', ids: [fingerprint('Healing for Ana').slice(0, 6), fingerprint('Peace in the Lee home').slice(0, 6)] }]);
    // Decoded once only.
    await listenOnce(dec, api, { searchHz: 0, receipts: true }, () => undefined);
    expect(ids).toHaveLength(1);
  });
});
