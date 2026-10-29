// The burst recordings the native apps' decoder is tested on (scripts/build-native-fixtures.ts):
// the station's own decoder must get exactly what manifest.json says from each, so the Swift
// port (apps/ios-native, BurstDecoderTests) and this reference are held to the same answers.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES, SAMPLE_BURST, type NativeFixture } from '../scripts/build-native-fixtures.js';
import { listen } from '../src/burst/burst.js';
import { fromWav } from '../src/burst/wav.js';

const manifest = JSON.parse(readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8')) as NativeFixture[];

describe('native decoder fixtures', () => {
  it('cover every preset and every robustness condition', () => {
    expect(new Set(manifest.filter((f) => f.condition === 'clean').map((f) => f.preset)).size).toBe(14);
    expect(new Set(manifest.map((f) => f.condition))).toEqual(new Set(['clean', 'noise', 'fading', 'drift', 'clipping']));
  });

  it('the Listen screen\'s sample burst is the clean fm-standard recording', () => {
    expect(readFileSync(SAMPLE_BURST).equals(readFileSync(path.join(FIXTURES, 'clean-fm-standard.wav')))).toBe(true);
  });

  for (const f of manifest) {
    it(`${f.file}: the station decodes what the manifest says`, () => {
      const wav = fromWav(readFileSync(path.join(FIXTURES, f.file)));
      expect(wav.sampleRate).toBe(48_000);
      const heard = listen(wav.samples, f.searchHz);
      expect(heard.map((h) => [h.callSign, h.preset, h.via])).toEqual([[f.callSign, f.preset, f.via]]);
      expect(heard[0]!.prayers).toEqual(f.prayers);
    }, 30_000);
  }
});
