// Burst robustness in practice mode (docs/RADIO_BURST.md, "Robustness"): every preset through
// noise, fading, drift and clipping over a range of SNRs, with the share of prayers decoded at
// each. Nothing is keyed; it all runs on simulated audio.
// `npm run burst -w @prayer-tower/station -- stress` prints the table in the doc.
import { buildBurst, listen, planFrames } from './burst.js';
import { HF_CHANNELS, hfChannel, type HfChannel } from './hf-channel.js';
import { PRESETS, type BurstPreset } from './presets.js';
import { bandFor } from './sim.js';
import { resample } from './wav.js';

/**
 * - noise: white noise and the radio's audio filter only.
 * - fading: FM presets get flat fading at 2 Hz (a mobile or handheld moving through
 *   multipath, "picket fencing"); HF presets get the CCIR 520 moderate channel.
 * - drift: the receiver's sound card clock 200 ppm off, and on HF a receiver tuned 15 Hz
 *   off (the decoder searches ±50 Hz there).
 * - clipping: the transmit audio overdriven into hard clipping at 30% of its peak.
 */
export type Impairment = 'noise' | 'fading' | 'drift' | 'clipping';
export const IMPAIRMENTS: readonly Impairment[] = ['noise', 'fading', 'drift', 'clipping'];
export const STRESS_SNRS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 30] as const;

const RATE = 48_000;
const CLOCK_PPM = 200;
const HF_OFFSET_HZ = 15;
const CLIP = 0.3;

const isHf = (p: BurstPreset) => p.name.startsWith('hf-');

/** One burst of `prayers` as a receiver would record it through one condition (48 kHz). */
export function impairedBurst(p: BurstPreset, prayers: readonly string[], impairment: Impairment, snrDb: number, seed: number, callSign = 'N0CALL'): Float32Array {
  let audio = buildBurst(planFrames(prayers, p, 20), p, callSign).audio;
  if (impairment === 'clipping') {
    let peak = 0;
    for (const s of audio) peak = Math.max(peak, Math.abs(s));
    const c = peak * CLIP;
    audio = audio.map((s) => Math.max(-c, Math.min(c, s)));
  }
  if (impairment === 'drift') audio = resample(audio, RATE, RATE * (1 + CLOCK_PPM / 1e6));
  const fading = isHf(p) ? HF_CHANNELS.moderate : { delayMs: 0, dopplerHz: 2 };
  const shape = impairment === 'fading' ? fading : HF_CHANNELS.quiet;
  const offsetHz = impairment === 'drift' && isHf(p) ? HF_OFFSET_HZ : 0;
  const channel: HfChannel = { ...shape, ...bandFor(p), snrDb, offsetHz, seed };
  return hfChannel(audio, channel);
}

/** How far off a receiver may be tuned for this preset in these tests: 50 Hz on HF (BURST_SEARCH_HZ), else 0. */
export const searchHzFor = (p: BurstPreset) => (isHf(p) ? 50 : 0);

/** One burst through one condition: how many of `prayers` came out intact and in order, and how many decoded prayers were never sent. */
export function stressTrial(p: BurstPreset, prayers: readonly string[], impairment: Impairment, snrDb: number, seed: number): { heard: number; wrong: number } {
  const got = listen(impairedBurst(p, prayers, impairment, snrDb, seed), searchHzFor(p)).flatMap((h) => h.prayers);
  const sent = new Set(prayers);
  let heard = 0;
  for (const t of got) if (t === prayers[heard]) heard++;
  return { heard, wrong: got.filter((t) => !sent.has(t)).length };
}

/** The share of `prayers` (0–1) decoded intact and in order, averaged over `seeds`. */
export function decodeRate(p: BurstPreset, prayers: readonly string[], impairment: Impairment, snrDb: number, seeds: readonly number[] = [1, 2]): number {
  let heard = 0;
  for (const seed of seeds) heard += stressTrial(p, prayers, impairment, snrDb, seed).heard;
  return heard / (prayers.length * seeds.length);
}

export interface StressRow {
  preset: string;
  impairment: Impairment;
  /** Decode rate at each of STRESS_SNRS. */
  rates: number[];
}

export function stressTable(prayers: readonly string[], presets: readonly BurstPreset[] = PRESETS, seeds: readonly number[] = [1, 2]): StressRow[] {
  return presets.flatMap((p) => IMPAIRMENTS.map((impairment) => ({ preset: p.name, impairment, rates: STRESS_SNRS.map((snr) => decodeRate(p, prayers, impairment, snr, seeds)) })));
}

export function stressMarkdown(rows: readonly StressRow[]): string {
  const pct = (r: number) => (r >= 1 ? '100' : r <= 0 ? '0' : String(Math.floor(r * 100)));
  return [
    `| Preset | Condition | ${STRESS_SNRS.map((s) => `${s} dB`).join(' | ')} |`,
    `| --- | --- | ${STRESS_SNRS.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| \`${r.preset}\` | ${r.impairment} | ${r.rates.map(pct).join(' | ')} |`),
  ].join('\n');
}
