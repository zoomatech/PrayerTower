// Burst robustness in practice mode (src/burst/stress.ts; the table is in docs/RADIO_BURST.md,
// "Robustness"): each preset under noise, fading, clock drift and clipping at a level the table
// shows it decodes every prayer, and never a prayer that wasn't sent, even where it fails.
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../src/burst/presets.js';
import { samplePrayers } from '../src/burst/sample.js';
import { IMPAIRMENTS, stressTrial, type Impairment } from '../src/burst/stress.js';

const SLOW = 60_000;
const prayers = samplePrayers(30);

/** The lowest SNR in the doc's table that decoded all 30 on both seeds; null where none did. */
const DECODES_AT: Record<string, Record<Impairment, number | null>> = {
  'fm-robust': { noise: 6, fading: 15, drift: 6, clipping: 9 },
  'fm-standard': { noise: 12, fading: 21, drift: 12, clipping: 12 },
  'fm-fast': { noise: 15, fading: 30, drift: 15, clipping: null },
  'dataport-fast': { noise: 18, fading: null, drift: 18, clipping: null },
  'fm-turbo': { noise: 21, fading: null, drift: 21, clipping: null },
  'dataport-turbo': { noise: 24, fading: null, drift: 24, clipping: null },
  'fm-robust-fec': { noise: 6, fading: 12, drift: 6, clipping: 6 },
  'fm-turbo-fec': { noise: 15, fading: 30, drift: 15, clipping: null },
  'fm-qam16': { noise: 12, fading: 18, drift: 12, clipping: 15 },
  'fm-qam64': { noise: 18, fading: 30, drift: 18, clipping: null },
  'dataport-qam64': { noise: 21, fading: 30, drift: 21, clipping: null },
  'hf-robust': { noise: 3, fading: 9, drift: 3, clipping: 3 },
  'hf-standard': { noise: 6, fading: 12, drift: 6, clipping: 6 },
  'hf-fast': { noise: 6, fading: 15, drift: 6, clipping: 9 },
};

describe('burst robustness: noise, fading, drift and clipping', () => {
  it('covers every preset', () => {
    expect(Object.keys(DECODES_AT).sort()).toEqual(PRESETS.map((p) => p.name).sort());
  });

  for (const p of PRESETS) {
    it(`${p.name}: every prayer at the table's level for each condition, and nothing wrong where it fails`, () => {
      for (const impairment of IMPAIRMENTS) {
        const at = DECODES_AT[p.name]![impairment];
        const run = stressTrial(p, prayers, impairment, at ?? 30, 1);
        if (at !== null) expect(run.heard, `${impairment} at ${at} dB`).toBe(prayers.length);
        expect(run.wrong, `${impairment}`).toBe(0);
        // Well below its level, it may lose prayers but never makes one up.
        expect(stressTrial(p, prayers, impairment, Math.max(0, (at ?? 30) - 9), 2).wrong, `${impairment} low`).toBe(0);
      }
    }, SLOW);
  }
});
