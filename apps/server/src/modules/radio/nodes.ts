// Radio nodes: receive-only listener nodes with their own keys (header x-node-key).
// A listener decodes the station's bursts and reports the SNR it measured; the
// station reads GET /station/channel before each burst (BURST_PRESET=auto) and
// gets the weakest fresh report, so the preset suits the hardest listener to reach.
// Off until an admin turns on listener_reports_enabled. docs/STATION_OPERATOR_GUIDE.md, "Listener nodes".
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, notFound } from '../../errors.js';

export interface RadioNode {
  id: string;
  name: string;
  role: 'listener' | 'station';
  enabled: boolean;
  created_at: string;
  last_seen_at: string | null;
}

const hash = (key: string) => createHash('sha256').update(key).digest('hex');

export async function enabled(q: Queryable) {
  const { rows } = await q.query<{ listener_reports_enabled: boolean }>('select listener_reports_enabled from public.token_settings');
  return rows[0]!.listener_reports_enabled;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set listener_reports_enabled = $1', [on]);
}

/** Extra stations (role 'station') may claim only while this is on. */
export async function multiStation(q: Queryable) {
  const { rows } = await q.query<{ multi_station_enabled: boolean }>('select multi_station_enabled from public.token_settings');
  return rows[0]!.multi_station_enabled;
}

export async function setMultiStation(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set multi_station_enabled = $1', [on]);
}

/** Which stations sent what in the last 24 hours, for Admin → Radio. */
export async function stationCounts(q: Queryable) {
  const { rows } = await q.query<{ node: string | null; sending: number; sent: number }>(
    `select n.name as node,
            count(*) filter (where r.status = 'sending')::int as sending,
            count(*) filter (where r.status = 'transmitted' and r.transmitted_at > now() - interval '24 hours')::int as sent
       from public.radio_prayers r left join public.radio_nodes n on n.id = r.claimed_by_node
      where r.status = 'sending' or (r.status = 'transmitted' and r.transmitted_at > now() - interval '24 hours')
      group by n.name order by n.name nulls first`,
  );
  return rows;
}

export async function list(q: Queryable): Promise<RadioNode[]> {
  const { rows } = await q.query<RadioNode>(`select id, name, role, enabled, created_at, last_seen_at from public.radio_nodes order by created_at`);
  return rows;
}

/** Add a node. The key is returned once; only its hash is kept. */
export async function create(q: Queryable, name: string, role: RadioNode['role'] = 'listener'): Promise<{ node: RadioNode; key: string }> {
  const key = `ptn_${randomBytes(24).toString('hex')}`;
  const { rows } = await q.query<RadioNode>(
    `insert into public.radio_nodes (name, role, key_hash) values ($1, $2, $3) returning id, name, role, enabled, created_at, last_seen_at`,
    [name.trim(), role, hash(key)],
  );
  return { node: rows[0]!, key };
}

export async function update(q: Queryable, id: string, patch: { enabled?: boolean }) {
  const { rows } = await q.query<RadioNode>(
    `update public.radio_nodes set enabled = coalesce($2, enabled) where id = $1 returning id, name, role, enabled, created_at, last_seen_at`,
    [id, patch.enabled ?? null],
  );
  if (!rows[0]) throw notFound('Radio node');
  return rows[0];
}

export async function remove(q: Queryable, id: string) {
  const { rowCount } = await q.query('delete from public.radio_nodes where id = $1', [id]);
  if (!rowCount) throw notFound('Radio node');
}

/** The enabled node with this key, marked as seen; 401 otherwise. */
export async function authenticate(q: Queryable, key: string | undefined, role: RadioNode['role']): Promise<RadioNode> {
  if (!key) throw new AppError(401, 'unauthenticated', 'Missing node key');
  const { rows } = await q.query<RadioNode>(
    `update public.radio_nodes set last_seen_at = now() where key_hash = $1 and role = $2 and enabled
     returning id, name, role, enabled, created_at, last_seen_at`,
    [hash(key), role],
  );
  if (!rows[0]) throw new AppError(401, 'unauthenticated', 'Bad node key');
  return rows[0];
}

export const ChannelReportInput = z.object({
  callSign: z.string().trim().min(3).max(20),
  preset: z.string().trim().min(1).max(40),
  snrDb: z.number().min(-50).max(100),
});

export async function recordReport(q: Queryable, nodeId: string, r: z.infer<typeof ChannelReportInput>) {
  await q.query(`insert into public.channel_reports (node_id, call_sign, preset, snr_db) values ($1, $2, $3, $4)`, [
    nodeId,
    r.callSign.toUpperCase(),
    r.preset,
    Math.round(r.snrDb * 10) / 10,
  ]);
  await q.query(`delete from public.channel_reports where id <= (select id from public.channel_reports order by id desc offset 2000 limit 1)`);
}

/** Reports older than this are ignored when the station asks. */
export const FRESH_MINUTES = 30;

/**
 * The channel report a station reads before a burst (auto.ts's ChannelReport
 * shape): each enabled listener's latest fresh report of this call sign, and of
 * those the weakest, so the chosen preset reaches every listener. Null when none.
 */
export async function channelFor(q: Queryable, callSign: string) {
  const { rows } = await q.query<{ snr_db: number; heard_at: Date; call_sign: string; preset: string; listeners: number }>(
    `with latest as (
       select distinct on (c.node_id) c.snr_db::float8 as snr_db, c.heard_at, c.call_sign, c.preset
         from public.channel_reports c join public.radio_nodes n on n.id = c.node_id and n.enabled
        where c.call_sign = $1 and c.heard_at > now() - make_interval(mins => $2)
        order by c.node_id, c.heard_at desc)
     select l.*, (select count(*)::int from latest) as listeners from latest l order by l.snr_db asc limit 1`,
    [callSign.toUpperCase(), FRESH_MINUTES],
  );
  const r = rows[0];
  return r ? { snrDb: r.snr_db, at: r.heard_at.toISOString(), callSign: r.call_sign, preset: r.preset, listeners: r.listeners } : null;
}

/** Admin → Radio: each listener's latest report. */
export async function latestReports(q: Queryable) {
  const { rows } = await q.query<{ node: string; call_sign: string; preset: string; snr_db: number; heard_at: string }>(
    `select distinct on (c.node_id) n.name as node, c.call_sign, c.preset, c.snr_db::float8 as snr_db, c.heard_at
       from public.channel_reports c join public.radio_nodes n on n.id = c.node_id
      order by c.node_id, c.heard_at desc`,
  );
  return rows;
}
