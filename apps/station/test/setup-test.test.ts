import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBurst, listen, type Burst } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { fingerprint } from '../src/burst/sha256.js';
import { simulateTransmitter, type BurstTransmitter } from '../src/burst/transmit.js';
import { parseLocation, peakDbfs, RollingDecoder, listenOnce, type ListenerApi } from '../src/listener.js';
import { runSetupTestOnce, testText, toneAudio, type SetupApi, type SetupResult, type SetupTest } from '../src/setup-test.js';

const preset = presetByName('fm-standard');
const cfg = { callSign: 'N0CALL', preset, maxFrameSeconds: 20 };

function api(test: SetupTest | null) {
  const results: { id: string; r: SetupResult }[] = [];
  const a: SetupApi = { setupTest: async () => test, setupResult: async (id, r) => void results.push({ id, r }) };
  return { a, results };
}

/** A transmitter that keeps what it sent. */
function capture(): BurstTransmitter & { bursts: Burst[]; tones: Float32Array[]; stopped: number } {
  const t = {
    mode: 'audio' as const,
    bursts: [] as Burst[],
    tones: [] as Float32Array[],
    stopped: 0,
    async send(batches: Uint8Array[], p: typeof preset, callSign: string) {
      const b = buildBurst(batches, p, callSign);
      t.bursts.push(b);
      return { frames: b.frames, seconds: b.seconds, bytes: b.bytes, decoded: null };
    },
    async stop() {
      t.stopped++;
    },
    async sendAudio(audio: Float32Array) {
      t.tones.push(audio);
    },
  };
  return t;
}

describe('setup wizard tests on the station', () => {
  it('does nothing when no test is waiting', async () => {
    const { a, results } = api(null);
    expect(await runSetupTestOnce(a, capture(), cfg, () => undefined)).toBeNull();
    expect(results).toEqual([]);
  });

  it('plays a tone at the bursts\' average level and reports its peak', async () => {
    const { a, results } = api({ id: 't1', kind: 'tone', seconds: 5, code: 'X' });
    const tx = capture();
    expect(await runSetupTestOnce(a, tx, cfg, () => undefined)).toBe('tone');
    const tone = tx.tones[0]!;
    expect(tone.length).toBe(5 * 48_000);
    const rms = Math.sqrt(tone.reduce((s, v) => s + v * v, 0) / tone.length);
    expect(rms).toBeCloseTo(0.2, 2);
    expect(Math.abs(tone[0]!)).toBeLessThan(1e-6);
    expect(results).toEqual([{ id: 't1', r: { ok: true, callSign: 'N0CALL', peakDbfs: -11 } }]);
  });

  it('sends a test burst a receiver decodes, and reports the fingerprint a listener will send back', async () => {
    const { a, results } = api({ id: 't2', kind: 'burst', seconds: 10, code: 'ABC123' });
    const tx = capture();
    expect(await runSetupTestOnce(a, tx, cfg, () => undefined)).toBe('burst');
    const heard = listen(tx.bursts[0]!.audio).flatMap((h) => h.prayers);
    expect(heard).toEqual([testText('ABC123')]);
    expect(results[0]!.r).toEqual({ ok: true, callSign: 'N0CALL', preset: 'fm-standard', sentHash: fingerprint('Station test ABC123') });

    // A listener node decodes it and reports that fingerprint, with the level it arrived at.
    const sent: Record<string, unknown>[] = [];
    const l: ListenerApi = { channelReport: async () => {}, heard: async (r) => void sent.push(r), heartbeat: async () => {} };
    const dec = new RollingDecoder();
    dec.push(new Float32Array([...new Float32Array(24_000), ...tx.bursts[0]!.audio, ...new Float32Array(24_000)]));
    await listenOnce(dec, l, { searchHz: 0, receipts: true }, () => undefined);
    expect(sent[0]).toMatchObject({ callSign: 'N0CALL', hashes: [results[0]!.r.sentHash] });
    expect(sent[0]!.peakDbfs as number).toBeLessThan(0);
    expect(sent[0]!.peakDbfs as number).toBeGreaterThan(-10);
  });

  it('reports a failed key-up and unkeys, without throwing', async () => {
    const { a, results } = api({ id: 't3', kind: 'burst', seconds: 10, code: 'Z' });
    const tx = capture();
    tx.send = async () => {
      throw new Error('rigctld: PTT did not key');
    };
    expect(await runSetupTestOnce(a, tx, cfg, () => undefined)).toBe('burst');
    expect(tx.stopped).toBe(1);
    expect(results[0]!.r).toEqual({ ok: false, callSign: 'N0CALL', error: 'rigctld: PTT did not key' });
  });

  it('says a mode with no audio path cannot play a tone', async () => {
    const { a, results } = api({ id: 't4', kind: 'tone', seconds: 5, code: 'Z' });
    const tx = capture();
    delete (tx as Partial<BurstTransmitter>).sendAudio;
    (tx as { mode: string }).mode = 'fldigi';
    await runSetupTestOnce(a, tx, cfg, () => undefined);
    expect(results[0]!.r.ok).toBe(false);
    expect(results[0]!.r.error).toMatch(/TUNE/);
  });

  it('simulate mode writes the tone to a file and keys nothing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'setup-'));
    const tx = simulateTransmitter(dir, () => undefined);
    await tx.sendAudio!(toneAudio(3), 48_000);
    expect(readdirSync(dir).some((f) => f.startsWith('tone-') && f.endsWith('.wav'))).toBe(true);
  });
});

describe('listener node extras', () => {
  it('measures a peak in dBFS', () => {
    expect(peakDbfs(new Float32Array([0, 0.5, -1]))).toBe(0);
    expect(peakDbfs(new Float32Array([0.1]))).toBe(-20);
    expect(peakDbfs(new Float32Array(10))).toBe(-200);
  });

  it('reads NODE_LOCATION, rounded to about a city, and shares nothing when unset', () => {
    expect(parseLocation(undefined)).toBeUndefined();
    expect(parseLocation('  ')).toBeUndefined();
    expect(parseLocation('39.7817, -89.6501')).toEqual({ lat: 39.8, lon: -89.7 });
    expect(parseLocation('39.78,-89.66,Springfield, IL')).toEqual({ lat: 39.8, lon: -89.7, place: 'Springfield, IL' });
    expect(() => parseLocation('north')).toThrow(/NODE_LOCATION/);
    expect(() => parseLocation('91,0')).toThrow(/NODE_LOCATION/);
  });
});
