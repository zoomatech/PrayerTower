// Prayer panel fixtures for the native apps' tests (apps/ios-native, PanelTests): a panel of the
// sample prayers (context-mixing codec, as the station sends it) as cells, and the same panel as
// a noisy Robot 36 SSTV recording at 12 kHz. The station's own decoder must agree
// (test/panel-fixtures.test.ts). Run after changing the panel or SSTV format:
//   npx tsx scripts/build-panel-fixtures.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toWav } from '../src/burst/wav.js';
import { encodePanel, panelImage } from '../src/panel/panel.js';
import { encodeRobot36 } from '../src/panel/sstv.js';
import { SAMPLE_PRAYERS } from '../test/fixtures/sample-prayers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PANEL_FIXTURES = path.resolve(here, '../../ios-native/Tests/PrayerTowerKitTests/Fixtures/panel');
export const SSTV_RATE = 12_000;

export interface PanelFixture {
  callSign: string;
  prayers: string[];
  /** 80 x 60 cells, row by row: "1" black, "0" white. */
  cells: string;
  sstv: string;
}

export function panelFixtures(): { fixture: PanelFixture; wav: Buffer } {
  const panel = encodePanel(SAMPLE_PRAYERS, 'N0CALL');
  const audio = encodeRobot36(panelImage(panel.cells, 4).gray, SSTV_RATE);
  // A second either side, and noise throughout (fixed seed).
  let x = 7;
  const r = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  const out = new Float32Array(audio.length + 2 * SSTV_RATE);
  for (let i = 0; i < out.length; i++) {
    const n = Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
    out[i] = (i >= SSTV_RATE && i < SSTV_RATE + audio.length ? audio[i - SSTV_RATE]! : 0) + 0.15 * n;
  }
  const fixture = { callSign: 'N0CALL', prayers: SAMPLE_PRAYERS.slice(0, panel.count), cells: Array.from(panel.cells).join(''), sstv: 'sstv-noise.wav' };
  return { fixture, wav: toWav(out, SSTV_RATE) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { fixture, wav } = panelFixtures();
  mkdirSync(PANEL_FIXTURES, { recursive: true });
  writeFileSync(path.join(PANEL_FIXTURES, fixture.sstv), wav);
  writeFileSync(path.join(PANEL_FIXTURES, 'panel.json'), `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`wrote the panel fixtures to ${PANEL_FIXTURES}`);
}
