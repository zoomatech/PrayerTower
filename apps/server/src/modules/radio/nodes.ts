// Radio nodes: receive-only listener nodes with their own keys (header x-node-key).
// A listener decodes the station's bursts and reports the SNR it measured; the
// station reads GET /station/channel before each burst (BURST_PRESET=auto) and
// gets the weakest fresh report, so the preset suits the hardest listener to reach.
// Off until an admin turns on listener_reports_enabled. docs/STATION_OPERATOR_GUIDE.md, "Listener nodes".
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
  /** What it listens with (heartbeat), null until it says. */
  receiver: z.infer<typeof Receiver> | null;
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
  const { rows } = await q.query<RadioNode>(`select id, name, role, enabled, created_at, last_seen_at, receiver from public.radio_nodes order by created_at`);
  return rows;
}

/** Add a node. The key is returned once; only its hash is kept. */
export async function create(q: Queryable, name: string, role: RadioNode['role'] = 'listener'): Promise<{ node: RadioNode; key: string }> {
  const key = `ptn_${randomBytes(24).toString('hex')}`;
  const { rows } = await q.query<RadioNode>(
    `insert into public.radio_nodes (name, role, key_hash) values ($1, $2, $3) returning id, name, role, enabled, created_at, last_seen_at, receiver`,
    [name.trim(), role, hash(key)],
  );
  return { node: rows[0]!, key };
}

export async function update(q: Queryable, id: string, patch: { enabled?: boolean }) {
  const { rows } = await q.query<RadioNode>(
    `update public.radio_nodes set enabled = coalesce($2, enabled) where id = $1 returning id, name, role, enabled, created_at, last_seen_at, receiver`,
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
     returning id, name, role, enabled, created_at, last_seen_at, receiver`,
    [hash(key), role],
  );
  if (!rows[0]) throw new AppError(401, 'unauthenticated', 'Bad node key');
  return rows[0];
}

/** A listener's receiver (station sdr.ts): a radio on a sound card, or an RTL-SDR dongle. */
export const Receiver = z.object({
  kind: z.enum(['sound-card', 'rtl-sdr']),
  freqHz: z.number().int().min(1).max(10e9).optional(),
  mode: z.enum(['fm', 'usb']).optional(),
});

export async function recordReceiver(q: Queryable, nodeId: string, r: z.infer<typeof Receiver>) {
  await q.query('update public.radio_nodes set receiver = $2 where id = $1', [nodeId, r]);
}

/** A store-and-forward relay's report, sent with its heartbeat (station relay.ts, RelayStatus). */
export const RelayStatus = z.object({
  callSign: z.string().trim().min(3).max(10),
  relayedLastHour: z.number().int().min(0).max(100_000),
  secondsLastHour: z.number().min(0).max(3600),
  budgetSeconds: z.number().min(0).max(3600),
  skipped: z.partialRecord(z.enum(['own', 'not_allowed', 'max_hops', 'duplicate', 'budget', 'unreadable']), z.number().int().min(0)).default({}),
});

export async function recordRelay(q: Queryable, nodeId: string, r: z.infer<typeof RelayStatus>) {
  await q.query('update public.radio_nodes set relay_status = $2, relay_reported_at = now() where id = $1', [nodeId, r]);
}

/** Relays that reported in the last hour, for the operator console. */
export async function relays(q: Queryable, now = new Date()) {
  const { rows } = await q.query<{ name: string; relay_status: z.infer<typeof RelayStatus>; relay_reported_at: Date }>(
    `select name, relay_status, relay_reported_at from public.radio_nodes
      where relay_status is not null and enabled and relay_reported_at > $1 order by name`,
    [new Date(now.getTime() - 3_600_000)],
  );
  return rows.map((r) => ({ node: r.name, reportedAt: r.relay_reported_at.toISOString(), ...r.relay_status }));
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

/**
 * Signed requests (docs/STATION_OPERATOR_GUIDE.md, "Signed listener reports").
 * Instead of x-node-key, a node sends:
 *   x-node-kid  the first 16 hex digits of sha256(key), naming the node
 *   x-node-ts   milliseconds since 1970, newer than its last signed request
 *   x-node-sig  HMAC-SHA256, keyed with sha256(key) in hex, of
 *               "<ts>\n<METHOD>\n<route path, e.g. /node/heard>\n<JSON body>"
 * The server keeps only sha256(key), which is all it needs to check the HMAC.
 */
export const SIGNATURE_WINDOW_MS = 5 * 60_000;

export const keyId = (key: string) => hash(key).slice(0, 16);

export async function signaturesRequired(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select node_signatures_required as on from public.token_settings');
  return rows[0]?.on === true;
}

export async function setSignaturesRequired(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set node_signatures_required = $1', [on]);
}

type NodeRequest = { headers: Record<string, string | string[] | undefined>; method: string; url: string; routeOptions?: { url?: string }; body?: unknown };

const header = (req: NodeRequest, name: string) => {
  const v = req.headers[name];
  return typeof v === 'string' ? v : undefined;
};

/**
 * The node behind a request: by its signature (x-node-kid, x-node-ts, x-node-sig),
 * or by its key (x-node-key) unless signatures are required. Marks it seen; 401 otherwise.
 */
export async function authenticateRequest(q: Queryable, req: NodeRequest, role: RadioNode['role'], now = Date.now()): Promise<RadioNode> {
  const signed = await signedNode(q, req, role, now);
  if (signed) return signed;
  if (await signaturesRequired(q)) throw new AppError(401, 'signature_required', 'Signed node requests are required');
  return authenticate(q, header(req, 'x-node-key'), role);
}

/** The node that signed this request; null for an unsigned one, 401 for a bad or replayed signature. */
async function signedNode(q: Queryable, req: NodeRequest, role: RadioNode['role'], now: number): Promise<RadioNode | null> {
  const kid = header(req, 'x-node-kid') ?? '';
  const ts = Number(header(req, 'x-node-ts'));
  const sig = header(req, 'x-node-sig') ?? '';
  if (!kid && !sig) return null;
  const bad = () => new AppError(401, 'unauthenticated', 'Bad node signature');
  if (!/^[0-9a-f]{16}$/.test(kid) || !Number.isSafeInteger(ts) || Math.abs(now - ts) > SIGNATURE_WINDOW_MS || !/^[0-9a-f]{64}$/.test(sig)) throw bad();
  const { rows } = await q.query<{ id: string; key_hash: string }>(
    `select id, key_hash from public.radio_nodes where left(key_hash, 16) = $1 and role = $2 and enabled`,
    [kid, role],
  );
  // The route's own path (/node/heard), so a proxy that adds a prefix in front doesn't break signatures.
  const path = req.routeOptions?.url ?? req.url.split('?')[0]!;
  const body = req.body === undefined ? '' : JSON.stringify(req.body);
  const node = rows.find((r) => {
    const want = Buffer.from(createHmac('sha256', r.key_hash).update(`${ts}\n${req.method.toUpperCase()}\n${path}\n${body}`).digest('hex'));
    const got = Buffer.from(sig);
    return got.length === want.length && timingSafeEqual(got, want);
  });
  if (!node) throw bad();
  // Newer than the last one, or it is a replay.
  const { rows: seen } = await q.query<RadioNode>(
    `update public.radio_nodes set last_seen_at = now(), last_signed_ms = $2 where id = $1 and (last_signed_ms is null or last_signed_ms < $2)
     returning id, name, role, enabled, created_at, last_seen_at, receiver`,
    [node.id, ts],
  );
  if (!seen[0]) throw new AppError(401, 'replayed', 'This signed request was already used');
  return seen[0];
}
