// Sky target (docs/STATION_OPERATOR_GUIDE.md, "Dish and sky target"): where the
// chosen target is from the dish right now (sky-math.ts), when it next rises or
// sets past the minimum elevation, and, if the admin chooses, no transmissions
// while it is below that. The station reads the same pointing from
// GET /station/sky to turn a rotator. Off until an admin turns on sky_target_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { nextCrossing, pointAt, SKY_TARGETS, type SkyTarget } from './sky-math.js';

export interface SkySettings {
  enabled: boolean;
  target: SkyTarget;
  custom: { name: string; raHours: number; decDeg: number } | null;
  location: { lat: number; lon: number } | null;
  minElevation: number;
  holdBelow: boolean;
}

export async function settings(q: Queryable): Promise<SkySettings> {
  const { rows } = await q.query<{
    enabled: boolean; target: SkyTarget; ra: string | null; dec: string | null; name: string | null; lat: string | null; lon: string | null; min_el: number; hold: boolean;
  }>(
    `select sky_target_enabled as enabled, sky_target as target, sky_custom_ra_hours as ra, sky_custom_dec_deg as dec, sky_custom_name as name,
            sky_lat as lat, sky_lon as lon, sky_min_elevation as min_el, sky_hold_below as hold from public.token_settings`,
  );
  const r = rows[0]!;
  return {
    enabled: r.enabled,
    target: r.target,
    custom: r.ra === null || r.dec === null ? null : { name: r.name ?? 'Custom', raHours: Number(r.ra), decDeg: Number(r.dec) },
    location: r.lat === null || r.lon === null ? null : { lat: Number(r.lat), lon: Number(r.lon) },
    minElevation: r.min_el,
    holdBelow: r.hold,
  };
}

export const SkyPatch = z.object({
  enabled: z.boolean().optional(),
  target: z.enum(SKY_TARGETS as [SkyTarget, ...SkyTarget[]]).optional(),
  custom: z.object({ name: z.string().trim().min(1).max(40), raHours: z.number().min(0).lt(24), decDeg: z.number().min(-90).max(90) }).nullable().optional(),
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable().optional(),
  minElevation: z.number().int().min(0).max(60).optional(),
  holdBelow: z.boolean().optional(),
});

export async function update(q: Queryable, p: z.infer<typeof SkyPatch>) {
  const round = (x: number) => Math.round(x * 100) / 100;
  await q.query(
    `update public.token_settings set
        sky_target_enabled = coalesce($1, sky_target_enabled),
        sky_target = coalesce($2, sky_target),
        sky_custom_name = case when $3 then $4 else sky_custom_name end,
        sky_custom_ra_hours = case when $3 then $5::numeric else sky_custom_ra_hours end,
        sky_custom_dec_deg = case when $3 then $6::numeric else sky_custom_dec_deg end,
        sky_lat = case when $7 then $8::numeric else sky_lat end,
        sky_lon = case when $7 then $9::numeric else sky_lon end,
        sky_min_elevation = coalesce($10, sky_min_elevation),
        sky_hold_below = coalesce($11, sky_hold_below)`,
    [
      p.enabled ?? null, p.target ?? null,
      p.custom !== undefined, p.custom?.name ?? null, p.custom?.raHours ?? null, p.custom?.decDeg ?? null,
      p.location !== undefined, p.location ? round(p.location.lat) : null, p.location ? round(p.location.lon) : null,
      p.minElevation ?? null, p.holdBelow ?? null,
    ],
  );
  return settings(q);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Where to point now, or null while off, with no location, or a custom target with no coordinates. */
export async function now(q: Queryable, at = new Date()) {
  const s = await settings(q);
  if (!s.enabled || !s.location) return null;
  const p = pointAt(s.target, s.location.lat, s.location.lon, at, s.custom);
  if (!p) return null;
  return {
    target: s.target,
    name: s.target === 'custom' ? s.custom!.name : null,
    az: round1(p.az),
    el: round1(p.el),
    aboveMinimum: p.el >= s.minElevation,
    minElevation: s.minElevation,
    holdBelow: s.holdBelow,
    // Straight up never moves.
    next: s.target === 'zenith' ? null : nextCrossing(s.target, s.location.lat, s.location.lon, at, s.minElevation, s.custom),
  };
}

/** False only while the hold is on and the target is below the minimum elevation. */
export async function allowsTransmit(q: Queryable, at = new Date()): Promise<boolean> {
  const s = await settings(q);
  if (!s.enabled || !s.holdBelow || !s.location) return true;
  const p = pointAt(s.target, s.location.lat, s.location.lon, at, s.custom);
  return !p || p.el >= s.minElevation;
}
