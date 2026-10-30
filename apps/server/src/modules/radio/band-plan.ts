// Band plan (docs/STATION_OPERATOR_GUIDE.md, "Band plan"), off until an admin turns on
// band_plan_enabled. The admin lists the bands the station may use: a frequency, FM or
// USB (HF), and optionally the preset for it. On HF the server picks the band for each
// burst from free space-weather data: NOAA SWPC's 10.7 cm solar flux and planetary K
// index, fetched every three hours while the plan is on. The station reads the pick
// (GET /station/band, BAND_PLAN=server on the station) and retunes before a burst.
//
// The pick is a rough estimate, not a forecast service: the solar flux gives a sunspot
// number (the statistical formula from Australia's Space Weather Services), noon foF2 at
// mid-latitudes rises about linearly with it, foF2 falls at night with the sun, the
// maximum usable frequency of a 3,000 km F2 hop is about three times foF2, and the best
// working frequency is about 80% of that. A geomagnetic storm (Kp 5 and up) lowers it.
// The station uses the highest HF band at or under that working frequency.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as coverage from './coverage.js';
import * as schedule from './schedule.js';

export const SWPC_FLUX = 'https://services.swpc.noaa.gov/json/f107_cm_flux.json';
export const SWPC_KP = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';

export const Band = z.object({
  /** "20 m", "2 m FM". */
  label: z.string().trim().min(1).max(30),
  freqHz: z.number().int().min(500_000).max(3_000_000_000),
  mode: z.enum(['fm', 'usb']),
  /** The burst preset for this band; unset = the station's own choice. */
  preset: z.string().trim().min(1).max(40).optional(),
});
export type Band = z.infer<typeof Band>;

export interface SpaceWeather {
  /** 10.7 cm solar flux, solar flux units. */
  sfi: number;
  /** Planetary K index, 0 to 9. */
  kp: number;
  /** When the flux was measured (UTC). */
  fluxAt: string;
  fetchedAt: string;
}

export interface PlanSettings {
  enabled: boolean;
  bands: Band[];
  spaceWeather: SpaceWeather | null;
}

export const PlanPatch = z.object({
  enabled: z.boolean().optional(),
  bands: z.array(Band).max(12).optional(),
});

export async function settings(q: Queryable): Promise<PlanSettings> {
  const { rows } = await q.query<PlanSettings>(
    `select band_plan_enabled as enabled, band_plan as bands, space_weather as "spaceWeather" from public.token_settings`,
  );
  return rows[0]!;
}

export async function update(q: Queryable, p: z.infer<typeof PlanPatch>) {
  await q.query(`update public.token_settings set band_plan_enabled = coalesce($1, band_plan_enabled), band_plan = coalesce($2::jsonb, band_plan)`, [
    p.enabled ?? null,
    p.bands ? JSON.stringify(p.bands) : null,
  ]);
  return settings(q);
}

export const isHf = (b: Pick<Band, 'freqHz'>) => b.freqHz < 30_000_000;

/** Sunspot number from the 10.7 cm flux (statistical; Space Weather Services, "The 10.7 cm solar radio flux"). */
export function sunspotsFromFlux(sfi: number): number {
  const fd = Math.max(0, sfi - 67);
  return Math.max(0, 1.61 * fd - (0.0733 * fd) ** 2 + (0.024 * fd) ** 3);
}

/** The sun's height factor at a longitude: 1 at local solar noon, 0 from sunset to sunrise (a 6 am to 6 pm day). */
export function dayFactor(lon: number, now: Date): number {
  const solarHour = (now.getUTCHours() + now.getUTCMinutes() / 60 + lon / 15 + 48) % 24;
  return Math.max(0, Math.cos(((solarHour - 12) / 12) * Math.PI));
}

/**
 * Estimated maximum usable frequency (MHz) of a 3,000 km F2 hop near the station. Noon
 * foF2 ≈ 4 + 0.04 R at mid-latitudes; at night it settles near 45% of that.
 */
export function estimateMuf(w: Pick<SpaceWeather, 'sfi' | 'kp'>, lon: number, now: Date): number {
  const noon = 4 + 0.04 * sunspotsFromFlux(w.sfi);
  const foF2 = noon * (0.45 + 0.55 * Math.sqrt(dayFactor(lon, now)));
  const storm = w.kp >= 7 ? 0.7 : w.kp >= 5 ? 0.85 : 1;
  return 3 * foF2 * storm;
}

export interface BandPick {
  band: Band;
  /** Why: the estimate it came from, or that it's the only band or not HF. */
  reason: 'hf' | 'only' | 'vhf' | 'no-data';
  mufMhz: number | null;
  workingMhz: number | null;
}

/**
 * The band for a burst at `now`. With VHF/UHF bands only, the first. On HF, the highest
 * band at or under the working frequency (80% of the estimated MUF), or the lowest HF band
 * when none is; with no space-weather data yet, the first HF band.
 */
export function pick(s: Pick<PlanSettings, 'bands' | 'spaceWeather'>, lon: number, now = new Date()): BandPick | null {
  if (!s.bands.length) return null;
  const hf = s.bands.filter(isHf).sort((a, b) => a.freqHz - b.freqHz);
  if (!hf.length) return { band: s.bands[0]!, reason: 'vhf', mufMhz: null, workingMhz: null };
  if (hf.length === 1) return { band: hf[0]!, reason: 'only', mufMhz: null, workingMhz: null };
  if (!s.spaceWeather) return { band: hf[0]!, reason: 'no-data', mufMhz: null, workingMhz: null };
  const muf = estimateMuf(s.spaceWeather, lon, now);
  const working = 0.8 * muf;
  const fits = hf.filter((b) => b.freqHz / 1e6 <= working);
  return { band: fits.at(-1) ?? hf[0]!, reason: 'hf', mufMhz: Math.round(muf * 10) / 10, workingMhz: Math.round(working * 10) / 10 };
}

/** The station's longitude (coverage map's station dot), or 0 when unset. */
async function stationLon(q: Queryable) {
  return (await coverage.settings(q)).station?.lon ?? 0;
}

/** What the station tunes to now; null while the plan is off or empty. */
export async function current(q: Queryable, now = new Date()) {
  const s = await settings(q);
  if (!s.enabled) return null;
  return pick(s, await stationLon(q), now);
}

/**
 * The next 24 hours, hour by hour, for the console: the band each hour would use and
 * whether the station may transmit then (windows and quiet hours).
 */
export async function outlook(q: Queryable, now = new Date()) {
  const s = await settings(q);
  if (!s.enabled) return null;
  const lon = await stationLon(q);
  const sched = await schedule.get(q);
  const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  const hours = Array.from({ length: 24 }, (_, i) => {
    const at = new Date(start + i * 3_600_000);
    const p = pick(s, lon, at);
    return { at: at.toISOString(), band: p?.band.label ?? null, mufMhz: p?.mufMhz ?? null, onAir: schedule.onAir(sched, at) };
  });
  return { now: pick(s, lon, now), spaceWeather: s.spaceWeather, hours };
}

/** Space weather from NOAA SWPC: the newest flux and the newest planetary K index. */
export async function fetchSpaceWeather(fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SpaceWeather> {
  const get = async (url: string) => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return (await res.json()) as unknown;
  };
  const flux = z.array(z.object({ time_tag: z.string(), flux: z.number().nullable() })).parse(await get(SWPC_FLUX));
  const kp = z.array(z.object({ time_tag: z.string(), estimated_kp: z.number().nullable().optional(), kp_index: z.number().nullable().optional() })).parse(await get(SWPC_KP));
  const latestFlux = flux.filter((f) => f.flux !== null && f.flux > 0).sort((a, b) => b.time_tag.localeCompare(a.time_tag))[0];
  const latestKp = kp.filter((k) => (k.estimated_kp ?? k.kp_index) != null).sort((a, b) => b.time_tag.localeCompare(a.time_tag))[0];
  if (!latestFlux || !latestKp) throw new Error('NOAA SWPC returned no flux or K index');
  return {
    sfi: Math.round(latestFlux.flux! * 10) / 10,
    kp: Math.round((latestKp.estimated_kp ?? latestKp.kp_index)! * 10) / 10,
    fluxAt: `${latestFlux.time_tag}Z`,
    fetchedAt: now.toISOString(),
  };
}

/** Every three hours while the plan is on and has an HF band: keep the latest space weather. */
export async function refresh(q: Queryable, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<SpaceWeather | null> {
  const s = await settings(q);
  if (!s.enabled || !s.bands.some(isHf)) return null;
  const w = await fetchSpaceWeather(fetchImpl, now);
  await q.query('update public.token_settings set space_weather = $1', [w]);
  return w;
}

export function refreshTask(q: Queryable, fetchImpl: typeof fetch = fetch): Task {
  return async (_payload, helpers) => {
    const w = await refresh(q, fetchImpl);
    helpers.logger.info(w ? `space weather: SFI ${w.sfi}, Kp ${w.kp}` : 'space weather: band plan off or no HF band');
  };
}
