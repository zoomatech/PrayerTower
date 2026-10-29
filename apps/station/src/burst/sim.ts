// End-to-end simulation of every preset (docs/RADIO_BURST.md, "Simulated
// throughput"): compress a batch, modulate it, pass it through a simulated
// radio path at a given noise level, decode it, and count what came through.
// `npm run burst -w @prayer-tower/station -- sim` prints the table in the doc.
import { buildBurst, listen, planFrames } from './burst.js';
import { HF_CHANNELS, hfChannel } from './hf-channel.js';
import { PRESETS, type BurstPreset } from './presets.js';

/** 'steady': no fading, just noise and the radio's audio filter; 'moderate'/'poor': CCIR 520 HF fading. */
export type SimChannel = 'steady' | 'moderate' | 'poor';

/** The audio filter of the hookup each preset is for. */
export function bandFor(p: BurstPreset): { lowHz: number; highHz: number } {
  if (p.name.startsWith('dataport-')) return { lowHz: 50, highHz: 7000 };
  if (p.name.startsWith('hf-')) return { lowHz: 300, highHz: 2700 };
  return { lowHz: 300, highHz: 3400 };
}

export interface SimResult {
  preset: string;
  channel: SimChannel;
  snrDb: number;
  sent: number;
  /** Prayers decoded intact, in order (a receiver never returns a wrong prayer: the frame CRC drops it). */
  heard: number;
  /** Air time of the whole burst, seconds. */
  seconds: number;
  bytes: number;
  frames: number;
}

/** Send `prayers` once on `preset` through `channel` at `snrDb` (SNR in 2.5 kHz) and decode. */
export function simulate(p: BurstPreset, prayers: readonly string[], channel: SimChannel, snrDb: number, seed = 1, maxFrameSeconds = 20): SimResult {
  const b = buildBurst(planFrames(prayers, p, maxFrameSeconds), p, 'N0CALL');
  const rx = hfChannel(b.audio, { ...HF_CHANNELS[channel === 'steady' ? 'quiet' : channel], ...bandFor(p), snrDb, offsetHz: 0, seed });
  const got = listen(rx).flatMap((h) => h.prayers);
  // Count the sent prayers that arrived in order.
  let heard = 0;
  for (const t of got) if (t === prayers[heard]) heard++;
  return { preset: p.name, channel, snrDb, sent: prayers.length, heard, seconds: b.seconds, bytes: b.bytes, frames: b.frames };
}

/**
 * The lowest SNR (whole dB, from `fromDb` down) at which every seed decodes every
 * prayer, or null if even `fromDb` fails. Stops at the first failure.
 */
export function threshold(p: BurstPreset, prayers: readonly string[], channel: SimChannel, seeds: readonly number[], fromDb = 35, toDb = -10): number | null {
  let best: number | null = null;
  for (let snr = fromDb; snr >= toDb; snr--) {
    if (!seeds.every((s) => simulate(p, prayers, channel, snr, s).heard === prayers.length)) break;
    best = snr;
  }
  return best;
}

export interface SimRow {
  preset: string;
  /** Prayers per second of air time for the batch. */
  rate: number;
  seconds: number;
  steadyDb: number | null;
  /** HF presets only: the CCIR 520 moderate channel. */
  fadingDb?: number | null;
}

/** One row per preset: air time, prayers per second, and the measured decode thresholds. */
export function simTable(prayers: readonly string[], seeds: readonly number[] = [1, 2, 3], presets: readonly BurstPreset[] = PRESETS): SimRow[] {
  return presets.map((p) => {
    const r = simulate(p, prayers, 'steady', 40);
    // Sweep down from 10 dB above the preset's rated floor (well clear of it) to save time.
    const row: SimRow = { preset: p.name, seconds: r.seconds, rate: prayers.length / r.seconds, steadyDb: threshold(p, prayers, 'steady', seeds, p.minSnrDb + 10) };
    if (p.name.startsWith('hf-')) row.fadingDb = threshold(p, prayers, 'moderate', seeds, 25);
    return row;
  });
}

export function simMarkdown(rows: readonly SimRow[], count: number): string {
  const db = (v: number | null | undefined) => (v === undefined ? '' : v === null ? 'not at the top of the sweep' : `${v} dB`);
  return [
    `| Preset | ${count} prayers on air | Prayers per second | Decodes all, steady (SNR in 2.5 kHz) | Decodes all, HF moderate fading |`,
    '| --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.preset}\` | ${r.seconds.toFixed(2)} s | ${r.rate.toFixed(1)} | ${db(r.steadyDb)} | ${db(r.fadingDb)} |`),
  ].join('\n');
}
