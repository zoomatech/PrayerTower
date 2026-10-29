// Automatic station ID in Morse code (src/station-id.ts) and the frequency in station reports.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Fldigi } from '../src/fldigi.js';
import { planFrames } from '../src/burst/burst.js';
import { presetByName } from '../src/burst/presets.js';
import { fldigiTransmitter, simulateTransmitter } from '../src/burst/transmit.js';
import { runBurstOnce } from '../src/burst/worker.js';
import { cwAudio, StationId, toMorse, withId } from '../src/station-id.js';
import type { StationApi } from '../src/worker.js';

/** Key-down runs (in samples) of CW audio: stretches where the tone is on. */
function keyRuns(x: Float32Array, rate = 48_000): number[] {
  const win = Math.round(rate / 1000);
  const runs: number[] = [];
  let on = 0;
  for (let i = 0; i < x.length; i += win) {
    let e = 0;
    for (let j = i; j < Math.min(x.length, i + win); j++) e = Math.max(e, Math.abs(x[j]!));
    if (e > 0.1) on += win;
    else if (on) {
      runs.push(on);
      on = 0;
    }
  }
  if (on) runs.push(on);
  return runs;
}

describe('station ID in Morse code', () => {
  it('spells the call sign in Morse code', () => {
    expect(toMorse('de K1ABC/P')).toBe('-.. . / -.- .---- .- -... -.-. -..-. .--.');
  });

  it('keys dots and dashes at the PARIS speed, with soft edges', () => {
    // "PARIS" is 43 dot units without the final word gap: at 20 wpm a dot is 60 ms.
    const audio = cwAudio('PARIS', { wpm: 20, toneHz: 800 });
    expect(audio.length).toBe(43 * 0.06 * 48_000);
    // P = .--. : dot, dash, dash, dot.
    const runs = keyRuns(audio).slice(0, 4).map((n) => Math.round(n / (0.06 * 48_000)));
    expect(runs).toEqual([1, 3, 3, 1]);
    expect(Math.abs(audio[0]!)).toBeLessThan(0.01);
    expect(audio.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeCloseTo(0.5, 1);
  });

  it('is due on the first key-up, then once the interval has passed', () => {
    let now = 0;
    const id = new StationId('K1ABC', 10 * 60_000, { wpm: 20, toneHz: 800 }, () => now);
    expect(id.take()).not.toBeNull();
    now = 9 * 60_000;
    expect(id.take()).toBeNull();
    expect(id.takeText()).toBe('');
    now = 10 * 60_000;
    expect(id.takeText()).toBe('de K1ABC');
    now = 15 * 60_000;
    const burst = new Float32Array(48_000).fill(0.2);
    expect(withId(burst, id)).toBe(burst);
    expect(withId(burst, undefined)).toBe(burst);
    now = 21 * 60_000;
    const out = withId(burst, id);
    expect(out.length).toBeGreaterThan(burst.length + 0.3 * 48_000);
    expect(out.subarray(0, burst.length)).toEqual(burst);
  });

  it('a burst followed by the ID still decodes in full, and the report carries the frequency', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'station-id-'));
    const logs: string[] = [];
    const id = new StationId('K1ABC', 600_000, { wpm: 20, toneHz: 800 });
    const tx = simulateTransmitter(dir, (m) => logs.push(m), { stationId: id });
    const reports: { id: string; frequencyHz?: number }[] = [];
    const api: StationApi = {
      claim: async () => null,
      claimBatch: async () => [{ id: 'p1', text: 'Peace for the Diaz family', repeats: 1 }, { id: 'p2', text: 'Healing for Sam', repeats: 1 }],
      report: async (pid, r) => void reports.push({ id: pid, frequencyHz: r.frequencyHz }),
    };
    const out = await runBurstOnce(api, tx, { callSign: 'K1ABC', preset: presetByName('fm-standard'), maxPrayers: 10, maxFrameSeconds: 20, blocklist: [], frequencyHz: 146_520_000 }, () => undefined, []);
    expect(out.kind).toBe('sent');
    expect(logs.some((l) => l.includes('station ID (CW) after the burst: de K1ABC'))).toBe(true);
    expect(logs.some((l) => l.includes('a receiver decodes 2 prayer(s)'))).toBe(true);
    expect(reports).toEqual([{ id: 'p1', frequencyHz: 146_520_000 }, { id: 'p2', frequencyHz: 146_520_000 }]);
  });

  it('in fldigi burst mode the ID is a "de CALL" line at the end of the key-up', async () => {
    const sent: string[] = [];
    const fldigi: Fldigi = { setModem: async () => {}, transmit: async (t) => void sent.push(t), rxOnly: async () => {}, status: async () => 'rx' };
    const tx = fldigiTransmitter(fldigi, 10_000, new StationId('K1ABC', 600_000, { wpm: 20, toneHz: 800 }));
    const p = presetByName('fm-standard');
    await tx.send(planFrames(['Hope for Lee'], p, 20), p, 'K1ABC');
    await tx.send(planFrames(['Hope for Lee'], p, 20), p, 'K1ABC');
    expect(sent[0]!.split('\n').at(-1)).toBe('de K1ABC');
    expect(sent[1]!.split('\n').at(-1)).not.toBe('de K1ABC');
  });
});
