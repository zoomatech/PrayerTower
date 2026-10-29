// Automatic preset choice (BURST_PRESET=auto, docs/RADIO_BURST.md "Auto
// preset"). A receiver that hears the station writes a channel report with
// the signal-to-noise ratio it measured (`cli.js decode rx.wav report.json`);
// before each burst the station reads the latest report and sends on the
// fastest preset whose working SNR, plus a safety margin, is below it. With no
// fresh report it falls back to the most robust preset in its list.
import { readFile, writeFile } from 'node:fs/promises';
import type { HeardPrayers } from './burst.js';
import { PRESETS, presetByName, rawBitRate, type BurstPreset } from './presets.js';

export interface ChannelReport {
  /** Measured SNR in 2.5 kHz (dB), the weakest frame the receiver heard. */
  snrDb: number;
  /** When the receiver heard it (ISO time). */
  at: string;
  callSign: string;
  preset: string;
}

const CODE_RATE = { r12: 1 / 2, r23: 2 / 3, r34: 3 / 4 } as const;

/** Payload bits per second after every layer of error correction. */
export function dataRate(p: BurstPreset): number {
  return rawBitRate(p) * (p.inner ? CODE_RATE[p.inner] : 1) * ((255 - p.parity) / 255);
}

/** Default candidates: every FM-audio preset except QAM, which needs audio known to be flat and unclipped. */
export const DEFAULT_AUTO_PRESETS = PRESETS.filter((p) => p.name.startsWith('fm-') && p.modulation !== 'qam').map((p) => p.name);

/** The fastest candidate that still decodes at snrDb with marginDb to spare, or the most robust one if none does. */
export function pickPreset(snrDb: number | null, candidates: readonly BurstPreset[], marginDb: number): BurstPreset {
  if (!candidates.length) throw new Error('no burst presets to choose from');
  const robust = candidates.reduce((a, b) => (b.minSnrDb < a.minSnrDb ? b : a));
  if (snrDb === null) return robust;
  const fits = candidates.filter((p) => p.minSnrDb + marginDb <= snrDb);
  return fits.length ? fits.reduce((a, b) => (dataRate(b) > dataRate(a) ? b : a)) : robust;
}

/** The report for what a receiver just heard from one station: its weakest frame. */
export function reportFrom(heard: readonly HeardPrayers[], now = new Date()): ChannelReport | null {
  if (!heard.length) return null;
  const weakest = heard.reduce((a, b) => (b.snrDb < a.snrDb ? b : a));
  return { snrDb: Math.round(weakest.snrDb * 10) / 10, at: now.toISOString(), callSign: weakest.callSign, preset: weakest.preset };
}

export async function writeReport(file: string, report: ChannelReport): Promise<void> {
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
}

/** Read a report from a file path or an http(s) URL; null when missing, unreadable or malformed (a 204 from the server included). */
export async function readReport(source: string, fetchFn: typeof fetch = fetch, headers: Record<string, string> = {}): Promise<ChannelReport | null> {
  try {
    const text = /^https?:\/\//.test(source) ? await (await fetchFn(source, { headers, signal: AbortSignal.timeout(5000) })).text() : await readFile(source, 'utf8');
    const r = JSON.parse(text) as Partial<ChannelReport>;
    if (typeof r.snrDb !== 'number' || !Number.isFinite(r.snrDb) || typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) return null;
    return { snrDb: r.snrDb, at: r.at, callSign: String(r.callSign ?? ''), preset: String(r.preset ?? '') };
  } catch {
    return null;
  }
}

export interface AutoConfig {
  /** File path or URL of the receiver's latest channel report. */
  report: string;
  candidates: readonly BurstPreset[];
  marginDb: number;
  /** Reports older than this are ignored. */
  maxAgeMs: number;
  /** Sent with a URL report, e.g. the station key for Prayer Tower's GET /station/channel. */
  headers?: Record<string, string>;
}

export function parseCandidates(list: string): BurstPreset[] {
  return list
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(presetByName);
}

/** A chooser for the burst loop: reads the report, picks, and says why. */
export function autoChooser(cfg: AutoConfig, log: (m: string) => void, now: () => number = Date.now, fetchFn?: typeof fetch) {
  return async (): Promise<BurstPreset> => {
    const r = await readReport(cfg.report, fetchFn, cfg.headers);
    const fresh = r && now() - Date.parse(r.at) <= cfg.maxAgeMs ? r : null;
    const p = pickPreset(fresh?.snrDb ?? null, cfg.candidates, cfg.marginDb);
    log(fresh ? `[auto] receiver measured ${fresh.snrDb} dB at ${fresh.at}: ${p.name}` : `[auto] no fresh channel report: ${p.name}`);
    return p;
  };
}
