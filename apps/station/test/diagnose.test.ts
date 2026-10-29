import { describe, expect, it } from 'vitest';
import { buildBurst, planFrames } from '../src/burst/burst.js';
import { diagnose, report } from '../src/burst/diagnose.js';
import { presetByName } from '../src/burst/presets.js';
import { encodeFrame, modulate } from '../src/packet/afsk.js';
import { statusFrames } from '../src/packet/message.js';

const noise = (n: number, sigma: number, seed = 3) => {
  let x = seed;
  const rnd = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) + 0.5) / 2 ** 32;
  return Float32Array.from({ length: n }, () => sigma * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd()));
};
const burst = (scale = 1) => {
  const p = presetByName('fm-standard');
  const b = buildBurst(planFrames(['Pray for my mother.', 'Pray for rain.'], p, 20), p, 'N0CALL');
  const pad = new Float32Array(24_000);
  const out = new Float32Array(pad.length * 2 + b.audio.length);
  out.set(b.audio, pad.length);
  return Float32Array.from(out, (v) => v * scale);
};

describe('decode replay and diagnostics', () => {
  it('replays a clean burst: one frame with its SNR margin, and nothing to fix', () => {
    const d = diagnose(burst(), 48_000);
    expect(d.frames).toHaveLength(1);
    expect(d.frames[0]).toMatchObject({ callSign: 'N0CALL', preset: 'fm-standard', needDb: presetByName('fm-standard').minSnrDb });
    expect(d.bands.voice).toBeGreaterThan(90);
    expect(d.advice).toEqual(['Everything decoded with a comfortable margin.']);
    expect(report(d).join('\n')).toContain('de N0CALL, fm-standard');
  });

  it('says when the audio is too quiet, clipped or full of hum', () => {
    const quiet = diagnose(Float32Array.from(burst(0.003)), 48_000, { searchHz: 0 });
    expect(quiet.advice[0]).toMatch(/very quiet/);
    const hot = diagnose(Float32Array.from(burst(), (v) => Math.max(-1, Math.min(1, v * 8))), 48_000, { searchHz: 0 });
    expect(hot.clippedPercent).toBeGreaterThan(0.1);
    expect(hot.advice.join(' ')).toMatch(/clipped/);
    const hum = diagnose(Float32Array.from({ length: 96_000 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 60 * i) / 48_000)), 48_000, { searchHz: 0 });
    expect(hum.bands.low).toBeGreaterThan(90);
    expect(hum.advice.join(' ')).toMatch(/hum/);
  });

  it('flags a weak frame near its preset limit, and plain noise as no burst', () => {
    const clean = burst();
    const hissy = noise(clean.length, 0.06);
    const weak = diagnose(Float32Array.from(clean, (v, i) => v + hissy[i]!), 48_000, { searchHz: 0 });
    if (weak.frames.length) expect(weak.frames[0]!.snrDb).toBeLessThan(40);
    const hiss = diagnose(noise(96_000, 0.1), 48_000, { searchHz: 0 });
    expect(hiss.frames).toEqual([]);
    expect(hiss.advice.join(' ')).toMatch(/No burst stands out|Nothing decoded/);
  });

  it('recognises the packet fallback', () => {
    const audio = modulate(statusFrames('N0CALL', ['3fa9c1', '07b2de']).map(encodeFrame), 48_000);
    const d = diagnose(audio, 48_000, { searchHz: 0 });
    expect(d.packets).toBe(1);
    expect(d.advice.join(' ')).toMatch(/BURST_MODE=packet/);
  });
});
