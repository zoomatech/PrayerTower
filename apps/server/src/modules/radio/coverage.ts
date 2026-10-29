// The coverage map (Admin → Radio; docs/STATION_OPERATOR_GUIDE.md, "Coverage
// map"), off until an admin turns on coverage_map_enabled. A listener node that
// opts in (NODE_LOCATION on the node) sends an approximate location with its
// heartbeat; an admin can also place a node by hand. Every location is rounded to
// 0.1 degree (about 11 km), roughly a city, before it is stored. The map shows
// each placed node with the signal it hears from the station.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { notFound } from '../../errors.js';

/** About a city: 0.1 degree is roughly 11 km north to south. */
export const round = (deg: number) => Math.round(deg * 10) / 10;

export const Location = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  place: z.string().trim().max(80).optional(),
});

export async function settings(q: Queryable) {
  const { rows } = await q.query<{ enabled: boolean; tile_url: string; lat: string | null; lon: string | null }>(
    `select coverage_map_enabled as enabled, coverage_tile_url as tile_url, radio_station_lat as lat, radio_station_lon as lon from public.token_settings`,
  );
  const r = rows[0]!;
  return { enabled: r.enabled, tileUrl: r.tile_url, station: r.lat === null || r.lon === null ? null : { lat: Number(r.lat), lon: Number(r.lon) } };
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  /** A map tile server, e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png; empty draws a plain grid. */
  tileUrl: z
    .string()
    .trim()
    .max(300)
    .refine((u) => u === '' || (/^https:\/\//.test(u) && u.includes('{z}') && u.includes('{x}') && u.includes('{y}')), 'An https URL with {z}, {x} and {y}')
    .optional(),
  station: Location.omit({ place: true }).nullable().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.token_settings set coverage_map_enabled = coalesce($1, coverage_map_enabled), coverage_tile_url = coalesce($2, coverage_tile_url),
            radio_station_lat = case when $3 then $4 else radio_station_lat end, radio_station_lon = case when $3 then $5 else radio_station_lon end`,
    [p.enabled ?? null, p.tileUrl ?? null, p.station !== undefined, p.station ? round(p.station.lat) : null, p.station ? round(p.station.lon) : null],
  );
  return settings(q);
}

/** From a node's heartbeat: kept only while the map is on, and always rounded. */
export async function fromNode(q: Queryable, nodeId: string, loc: z.infer<typeof Location>) {
  if (!(await settings(q)).enabled) return;
  await q.query(`update public.radio_nodes set lat = $2, lon = $3, place = coalesce($4, place) where id = $1`, [nodeId, round(loc.lat), round(loc.lon), loc.place || null]);
}

/** An admin places (or with null, removes) a node by hand. */
export async function place(q: Queryable, nodeId: string, loc: z.infer<typeof Location> | null) {
  const { rowCount } = await q.query(`update public.radio_nodes set lat = $2, lon = $3, place = $4 where id = $1`, [
    nodeId,
    loc ? round(loc.lat) : null,
    loc ? round(loc.lon) : null,
    loc?.place || null,
  ]);
  if (!rowCount) throw notFound('Radio node');
}

export type Quality = 'strong' | 'fair' | 'weak' | 'none';

/** SNR in 2.5 kHz: 20 dB and up decodes every preset but the fastest; under 10 dB only the robust ones. */
export function quality(snrDb: number | null): Quality {
  if (snrDb === null) return 'none';
  if (snrDb >= 20) return 'strong';
  if (snrDb >= 10) return 'fair';
  return 'weak';
}

export interface MapPoint {
  id: string;
  name: string;
  place: string | null;
  lat: number;
  lon: number;
  /** Median SNR of the node's reports in the last 24 hours (null: it heard nothing). */
  snrDb: number | null;
  reports: number;
  lastHeardAt: string | null;
  lastSeenAt: string | null;
  quality: Quality;
  /** What it listens with, when it has said (nodes.ts Receiver). */
  receiver: { kind: 'sound-card' | 'rtl-sdr'; freqHz?: number; mode?: 'fm' | 'usb' } | null;
}

/** Placed listener nodes and the station, for the map. Unplaced nodes are counted, not shown. */
export async function map(q: Queryable) {
  const s = await settings(q);
  const { rows } = await q.query<{ id: string; name: string; place: string | null; lat: string | null; lon: string | null; snr: number | null; reports: number; last_heard: string | null; last_seen_at: string | null; receiver: MapPoint['receiver'] }>(
    `select n.id, n.name, n.place, n.lat, n.lon, n.last_seen_at, n.receiver,
            (select percentile_cont(0.5) within group (order by c.snr_db)::float8 from public.channel_reports c where c.node_id = n.id and c.heard_at > now() - interval '24 hours') as snr,
            (select count(*)::int from public.channel_reports c where c.node_id = n.id and c.heard_at > now() - interval '24 hours') as reports,
            (select max(c.heard_at) from public.channel_reports c where c.node_id = n.id) as last_heard
       from public.radio_nodes n where n.role = 'listener' and n.enabled order by n.name`,
  );
  const points: MapPoint[] = rows
    .filter((r) => r.lat !== null && r.lon !== null)
    .map((r) => {
      const snrDb = r.snr === null ? null : Math.round(r.snr * 10) / 10;
      return { id: r.id, name: r.name, place: r.place, lat: Number(r.lat), lon: Number(r.lon), snrDb, reports: r.reports, lastHeardAt: r.last_heard, lastSeenAt: r.last_seen_at, quality: quality(snrDb), receiver: r.receiver };
    });
  const unplaced = rows.filter((r) => r.lat === null || r.lon === null).map((r) => ({ id: r.id, name: r.name }));
  return { ...s, points, unplaced };
}
