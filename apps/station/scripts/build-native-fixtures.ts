// Burst recordings for the native apps' decoder tests (apps/ios-native, BurstDecoderTests): one
// short burst on every preset, plus noisy, fading, drifting and clipped ones from the robustness
// suite (src/burst/stress.ts), a codec 4 batch and a relayed one. Each WAV is listed in
// manifest.json with what a decoder must get from it. The station's own decoder must agree
// (test/native-fixtures.test.ts). It also writes the native Listen screen's sample burst.
// Run after changing the burst format:
//   npx tsx scripts/build-native-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBurst, planFrames } from '../src/burst/burst.js';
import { Codec, encodeBatch } from '../src/burst/codec.js';
import { modulate } from '../src/burst/ofdm.js';
import { PRESETS, presetByName } from '../src/burst/presets.js';
import { wrapRelay } from '../src/burst/relay-frame.js';
import { impairedBurst, searchHzFor, type Impairment } from '../src/burst/stress.js';
import { toWav } from '../src/burst/wav.js';
import { SAMPLE_PRAYERS } from '../test/fixtures/sample-prayers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(here, '../../ios-native/Tests/PrayerTowerKitTests/Fixtures/bursts');
/** The Listen screen's "Decode a sample burst" (no radio, no server): the clean fm-standard one. */
export const SAMPLE_BURST = path.resolve(here, '../../ios-native/Sources/PrayerTowerKit/Resources/sample-burst.wav');

export interface NativeFixture {
  file: string;
  preset: string;
  condition: 'clean' | Impairment;
  snrDb: number | null;
  searchHz: number;
  callSign: string;
  via?: string;
  codec: number;
  prayers: string[];
}

// Plain words either edition may show: the sample burst plays in Open Circle too.
const SHORT = ['Please keep my mother in mind before her surgery on Tuesday.', 'Thankful for a safe trip home!', 'Peace for our town, and rain for the farms.'];
const NOISY = SAMPLE_PRAYERS.slice(0, 8);
/** Each condition at the level the robustness table shows decodes every prayer (docs/RADIO_BURST.md, "Robustness"). */
const STRESSED: [string, Impairment, number][] = [
  ['fm-standard', 'noise', 12],
  ['fm-robust-fec', 'fading', 12],
  ['fm-standard', 'drift', 12],
  ['fm-qam16', 'clipping', 15],
  ['hf-standard', 'drift', 6],
  ['hf-robust', 'fading', 9],
  ['fm-fast', 'noise', 15],
];

const pad = (audio: Float32Array) => {
  const out = new Float32Array(audio.length + 4800);
  out.set(audio, 2400);
  return out;
};

export function fixtures(): { manifest: NativeFixture[]; wavs: Map<string, Buffer> } {
  const manifest: NativeFixture[] = [];
  const wavs = new Map<string, Buffer>();
  const add = (f: NativeFixture, audio: Float32Array) => {
    manifest.push(f);
    wavs.set(f.file, toWav(audio, 48_000));
  };
  for (const p of PRESETS) {
    const batches = planFrames(SHORT, p, 20);
    add({ file: `clean-${p.name}.wav`, preset: p.name, condition: 'clean', snrDb: null, searchHz: 0, callSign: 'N0CALL', codec: batches[0]![0]!, prayers: SHORT }, pad(buildBurst(batches, p, 'N0CALL').audio));
  }
  for (const [name, condition, snr] of STRESSED) {
    const p = presetByName(name);
    add({ file: `${condition}-${name}-${snr}db.wav`, preset: name, condition, snrDb: snr, searchHz: searchHzFor(p), callSign: 'N0CALL', codec: planFrames(NOISY, p, 20)[0]![0]!, prayers: NOISY }, impairedBurst(p, NOISY, condition, snr, 1));
  }
  const p = presetByName('fm-standard');
  const v2 = planFrames(SHORT, p, 20, { codecV2: true });
  add({ file: 'codec4-fm-standard.wav', preset: p.name, condition: 'clean', snrDb: null, searchHz: 0, callSign: 'K0GIN', codec: v2[0]![0]!, prayers: SHORT }, pad(buildBurst(v2, p, 'K0GIN').audio));
  const plain = encodeBatch(SHORT.slice(0, 1), [Codec.Plain]);
  add({ file: 'relayed-fm-robust.wav', preset: 'fm-robust', condition: 'clean', snrDb: null, searchHz: 0, callSign: 'K0GIN', via: 'W1RLY', codec: 0, prayers: SHORT.slice(0, 1) },
    pad(modulate(wrapRelay(plain, 'K0GIN', 1), presetByName('fm-robust'), 'W1RLY')));
  return { manifest, wavs };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { manifest, wavs } = fixtures();
  mkdirSync(FIXTURES, { recursive: true });
  for (const [file, data] of wavs) writeFileSync(path.join(FIXTURES, file), data);
  writeFileSync(path.join(FIXTURES, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(SAMPLE_BURST, wavs.get('clean-fm-standard.wav')!);
  console.log(`wrote ${wavs.size} recordings to ${FIXTURES}`);
}
