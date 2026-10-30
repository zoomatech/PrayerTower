// The prayer panel fixtures the native apps are tested on (scripts/build-panel-fixtures.ts): the
// station's own decoder must read exactly what panel.json says from the cells and the recording.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_FIXTURES, panelFixtures, type PanelFixture } from '../scripts/build-panel-fixtures.js';
import { decodeBatch } from '../src/burst/codec.js';
import { fromWav } from '../src/burst/wav.js';
import { decodeCells, decodePanelImage } from '../src/panel/panel.js';
import { decodeRobot36 } from '../src/panel/sstv.js';

const fixture = JSON.parse(readFileSync(path.join(PANEL_FIXTURES, 'panel.json'), 'utf8')) as PanelFixture;

describe('native panel fixtures', () => {
  it('are up to date', () => {
    const { fixture: fresh, wav } = panelFixtures();
    expect(fresh).toEqual(fixture);
    expect(wav.equals(readFileSync(path.join(PANEL_FIXTURES, fixture.sstv)))).toBe(true);
  });

  it('the cells read back to the prayers, with the context-mixing codec', () => {
    const frame = decodeCells(Uint8Array.from(fixture.cells, (c) => (c === '1' ? 1 : 0)));
    expect(frame?.callSign).toBe(fixture.callSign);
    expect(frame?.batch[0]).toBe(3);
    expect(decodeBatch(frame!.batch)).toEqual(fixture.prayers);
  });

  it('the SSTV recording reads back to the prayers', () => {
    const wav = fromWav(readFileSync(path.join(PANEL_FIXTURES, fixture.sstv)));
    const pic = decodeRobot36(wav.samples, wav.sampleRate);
    const frame = pic && decodePanelImage(pic.gray, 320, 240);
    expect(frame && decodeBatch(frame.batch)).toEqual(fixture.prayers);
  }, 30_000);
});
