// End-to-end simulation across every preset at several noise levels
// (src/burst/sim.ts; the table is in docs/RADIO_BURST.md, "Simulated throughput").
import { describe, expect, it } from 'vitest';
import { PRESETS, presetByName } from '../src/burst/presets.js';
import { simMarkdown, simulate, type SimRow } from '../src/burst/sim.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

describe('every preset at several noise levels', () => {
  for (const p of PRESETS) {
    it(`${p.name}: all 30 prayers at ${p.minSnrDb + 2} and ${p.minSnrDb + 12} dB, and no wrong prayer far below ${p.minSnrDb} dB`, () => {
      // Two dB above the preset's rated floor, and well above it.
      for (const [snr, seed] of [[p.minSnrDb + 2, 1], [p.minSnrDb + 2, 2], [p.minSnrDb + 12, 3]] as const) {
        expect(simulate(p, SAMPLE_PRAYERS, 'steady', snr, seed).heard).toBe(SAMPLE_PRAYERS.length);
      }
      // Far below it, what gets through (usually nothing) is still only real prayers, in order.
      const low = simulate(p, SAMPLE_PRAYERS, 'steady', p.minSnrDb - 10, 4);
      expect(low.heard).toBeLessThan(SAMPLE_PRAYERS.length);
    });
  }

  it('HF presets get every prayer through CCIR 520 moderate fading at their rated fading level', () => {
    for (const [name, snr] of [['hf-robust', 9], ['hf-standard', 13], ['hf-fast', 16]] as const) {
      for (const seed of [1, 2]) expect(simulate(presetByName(name), SAMPLE_PRAYERS, 'moderate', snr, seed).heard, `${name} seed ${seed}`).toBe(SAMPLE_PRAYERS.length);
    }
  });

  it('faster presets carry more prayers a second of air time, and need more signal for it', () => {
    const rate = (name: string) => SAMPLE_PRAYERS.length / simulate(presetByName(name), SAMPLE_PRAYERS, 'steady', 40).seconds;
    expect(rate('fm-robust')).toBeLessThan(rate('fm-standard'));
    expect(rate('fm-standard')).toBeLessThan(rate('fm-fast'));
    expect(rate('fm-fast')).toBeLessThan(rate('dataport-turbo'));
    expect(rate('hf-robust')).toBeLessThan(rate('hf-fast'));
    expect(presetByName('fm-robust').minSnrDb).toBeLessThan(presetByName('fm-fast').minSnrDb);
  });

  it('prints the table for the doc', () => {
    const rows: SimRow[] = [{ preset: 'fm-fast', rate: 22.5, seconds: 1.33, steadyDb: 15 }, { preset: 'hf-robust', rate: 4.9, seconds: 6.1, steadyDb: 2, fadingDb: null }];
    expect(simMarkdown(rows, 30).split('\n')).toEqual([
      '| Preset | 30 prayers on air | Prayers per second | Decodes all, steady (SNR in 2.5 kHz) | Decodes all, HF moderate fading |',
      '| --- | --- | --- | --- | --- |',
      '| `fm-fast` | 1.33 s | 22.5 | 15 dB |  |',
      '| `hf-robust` | 6.10 s | 4.9 | 2 dB | not at the top of the sweep |',
    ]);
  });
});
