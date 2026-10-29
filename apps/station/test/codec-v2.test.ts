import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildBurst, listen, planFrames } from '../src/burst/burst.js';
import { cmCompress } from '../src/burst/cm.js';
import { ALL_V2, Codec, decodeBatch, encodeBatch } from '../src/burst/codec.js';
import { DICTIONARY_V1 } from '../src/burst/dictionary.js';
import { PRIMER_V1 } from '../src/burst/primer.js';
import { presetByName } from '../src/burst/presets.js';
import { samplePrayers } from '../src/burst/sample.js';
import { decodeAudio } from '../src/burst/web.js';
import { SAMPLE_PRAYERS } from './fixtures/sample-prayers.js';

describe('codec 4: context mixing v2 (BURST_CODEC_V2)', () => {
  it('leaves codec 3 bit for bit as it was, so every receiver in the field still reads it', () => {
    const primer = Buffer.from(PRIMER_V1 + DICTIONARY_V1, 'latin1');
    const packed = cmCompress(Buffer.from(SAMPLE_PRAYERS.join('\n'), 'latin1'), primer, 'v1');
    expect(createHash('sha256').update(packed).digest('hex')).toBe('2f5aa78f3515d2bc47ec22e0f7ea00d6dd496c5be435be0fd117045cad9ed6dd');
  });

  it('is off by default, and when on is picked because it is smaller, and decodes back exactly', () => {
    expect(encodeBatch(SAMPLE_PRAYERS)[0]).toBe(Codec.ContextMix1);
    for (const set of [SAMPLE_PRAYERS, samplePrayers(100)]) {
      const v2 = encodeBatch(set, ALL_V2);
      expect(v2[0]).toBe(Codec.ContextMix2);
      expect(v2.length).toBeLessThan(encodeBatch(set).length);
      expect(decodeBatch(v2)).toEqual(set);
    }
    // A single prayer: whichever is smaller, never worse than codec 3.
    for (const one of SAMPLE_PRAYERS.slice(0, 10)) {
      const v2 = encodeBatch([one], ALL_V2);
      expect(v2.length).toBeLessThanOrEqual(encodeBatch([one]).length);
      expect(decodeBatch(v2)).toEqual([one]);
    }
    // The 30 hand-written requests: 624 bytes with codec 3, at least 8% fewer with codec 4.
    expect(encodeBatch(SAMPLE_PRAYERS, ALL_V2).length).toBeLessThanOrEqual(Math.floor(624 * 0.92));
  });

  it('goes over the air in a burst the station, listeners and the browser page all decode', () => {
    const p = presetByName('fm-standard');
    const b = buildBurst(planFrames(SAMPLE_PRAYERS, p, 20, { codecV2: true }), p, 'N0CALL');
    expect(listen(b.audio).flatMap((h) => h.prayers)).toEqual(SAMPLE_PRAYERS);
    const web = decodeAudio(b.audio, 48_000);
    expect(web.map((f) => f.codec)).toEqual([Codec.ContextMix2]);
    expect(web.flatMap((f) => f.prayers ?? [])).toEqual(SAMPLE_PRAYERS);
  });
});
