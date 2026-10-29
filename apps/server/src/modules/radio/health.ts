// Station health alerts (Admin → Radio; docs/STATION_OPERATOR_GUIDE.md, "Health alerts").
// The station reports what only it can see (is there an audio device, does the
// radio key) to POST /station/status every minute or so. The server adds what
// it can see: an empty queue, prayers waiting longer than station_overdue_minutes,
// a failed last burst, and a station that stopped checking in.
// Off until an admin turns on station_alerts_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { stationSettings } from './index.js';
import * as nodes from './nodes.js';
import * as schedule from './schedule.js';

export const StationStatus = z.object({
  callSign: z.string().trim().min(3).max(20),
  checks: z
    .array(z.object({ name: z.string().trim().min(1).max(40), ok: z.boolean(), detail: z.string().max(300).default('') }))
    .max(20),
});

export async function recordStatus(q: Queryable, s: z.infer<typeof StationStatus>) {
  await q.query(
    `insert into public.station_status (call_sign, checks) values ($1, $2::jsonb)
     on conflict (call_sign) do update set checks = excluded.checks, reported_at = now()`,
    [s.callSign.toUpperCase(), JSON.stringify(s.checks)],
  );
}

export type AlertKind = 'no_audio_device' | 'ptt_failed' | 'burst_failed' | 'burst_overdue' | 'station_silent' | 'listener_silent' | 'queue_empty';

export interface StationAlert {
  kind: AlertKind;
  /** problem: needs a person; info: worth knowing (an empty queue). */
  level: 'problem' | 'info';
  detail: string;
  callSign: string | null;
  since: string | null;
}

/** A station that has not reported for this long is "silent" (it reports about once a minute). */
export const STATUS_STALE_MINUTES = 10;
/** A listener node checks in at least every few minutes (its heartbeat); after this long it is "silent". */
export const LISTENER_STALE_MINUTES = 30;

/** Enabled listener nodes that checked in once but not lately (only while listener reports are on). */
async function silentListeners(q: Queryable, now: Date) {
  if (!(await nodes.enabled(q))) return [];
  const { rows } = await q.query<{ name: string; last_seen_at: Date }>(
    `select name, last_seen_at from public.radio_nodes
      where role = 'listener' and enabled and last_seen_at is not null and last_seen_at < $1 order by name`,
    [new Date(now.getTime() - LISTENER_STALE_MINUTES * 60_000)],
  );
  return rows;
}

export async function settings(q: Queryable) {
  const { rows } = await q.query<{ station_alerts_enabled: boolean; station_overdue_minutes: number }>(
    'select station_alerts_enabled, station_overdue_minutes from public.token_settings',
  );
  return rows[0]!;
}

export async function updateSettings(q: Queryable, patch: { enabled?: boolean; overdueMinutes?: number }) {
  await q.query(
    `update public.token_settings set station_alerts_enabled = coalesce($1, station_alerts_enabled), station_overdue_minutes = coalesce($2, station_overdue_minutes)`,
    [patch.enabled ?? null, patch.overdueMinutes ?? null],
  );
  return settings(q);
}

/**
 * Every alert that holds now, problems first. Empty when the switch is off (unless
 * force, for operator alerts, which have their own switch) or the radio is not in station mode.
 */
export async function alerts(q: Queryable, now = new Date(), opts: { force?: boolean } = {}): Promise<{ enabled: boolean; overdueMinutes: number; alerts: StationAlert[] }> {
  const s = await settings(q);
  const out = { enabled: s.station_alerts_enabled, overdueMinutes: s.station_overdue_minutes, alerts: [] as StationAlert[] };
  if ((!s.station_alerts_enabled && !opts.force) || (await stationSettings(q)).radio_transmitter !== 'station') return out;
  const list = out.alerts;

  const { rows: stations } = await q.query<{ call_sign: string; checks: { name: string; ok: boolean; detail: string }[]; reported_at: Date }>(
    'select call_sign, checks, reported_at from public.station_status order by reported_at desc',
  );
  for (const st of stations) {
    const since = st.reported_at.toISOString();
    if (now.getTime() - st.reported_at.getTime() > STATUS_STALE_MINUTES * 60_000) {
      list.push({ kind: 'station_silent', level: 'problem', detail: `No report for ${Math.round((now.getTime() - st.reported_at.getTime()) / 60_000)} min.`, callSign: st.call_sign, since });
      continue;
    }
    for (const c of st.checks.filter((c) => !c.ok)) {
      if (c.name === 'audio') list.push({ kind: 'no_audio_device', level: 'problem', detail: c.detail, callSign: st.call_sign, since });
      else if (c.name === 'rig') list.push({ kind: 'ptt_failed', level: 'problem', detail: c.detail, callSign: st.call_sign, since });
    }
  }

  // The last burst failed (the station stops itself after a transmit failure).
  const { rows: bursts } = await q.query<{ call_sign: string; created_at: Date; error: string | null; ok: boolean }>(
    'select call_sign, created_at, error, ok from public.station_bursts order by id desc limit 1',
  );
  const last = bursts[0];
  if (last && !last.ok) {
    const ptt = /\b(ptt|rig|rigctld)\b/i.test(last.error ?? '');
    if (!(ptt && list.some((a) => a.kind === 'ptt_failed'))) {
      list.push({ kind: ptt ? 'ptt_failed' : 'burst_failed', level: 'problem', detail: last.error ?? '', callSign: last.call_sign, since: last.created_at.toISOString() });
    }
  }

  for (const l of await silentListeners(q, now)) {
    const mins = Math.round((now.getTime() - l.last_seen_at.getTime()) / 60_000);
    list.push({ kind: 'listener_silent', level: 'info', detail: `${l.name}: no check-in for ${mins} min.`, callSign: null, since: l.last_seen_at.toISOString() });
  }

  const { rows: q2 } = await q.query<{ queued: number; oldest: Date | null }>(
    `select count(*)::int as queued, min(created_at) as oldest from public.radio_prayers where status = 'queued'`,
  );
  const { queued, oldest } = q2[0]!;
  if (!queued) list.push({ kind: 'queue_empty', level: 'info', detail: 'Nothing is waiting to go out.', callSign: null, since: null });
  // Outside the transmission windows prayers are meant to wait (schedule.ts).
  else if (oldest && now.getTime() - oldest.getTime() > s.station_overdue_minutes * 60_000 && schedule.onAir(await schedule.get(q), now)) {
    const mins = Math.round((now.getTime() - oldest.getTime()) / 60_000);
    list.push({ kind: 'burst_overdue', level: 'problem', detail: `${queued} waiting; the oldest for ${mins} min.`, callSign: null, since: oldest.toISOString() });
  }
  list.sort((a, b) => (a.level === b.level ? 0 : a.level === 'problem' ? -1 : 1));
  return out;
}

// Health page (Admin → Radio, "Station health"), off until station_health_page_enabled.

export async function pageEnabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select station_health_page_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setPageEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set station_health_page_enabled = $1', [on]);
}

export interface StationHealth {
  callSign: string;
  /** Its last POST /station/status, and whether that is older than STATUS_STALE_MINUTES. */
  lastHeartbeat: string | null;
  silent: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  bursts24h: number;
  failed24h: number;
  prayers24h: number;
  lastBurstAt: string | null;
  lastError: string | null;
}

/**
 * Everything on the health page: each station (by call sign) with its last
 * check-in and last day of bursts, the queue, what listeners measured per
 * preset in the last day, and the latest failures. Null while the switch is off.
 */
export async function overview(q: Queryable, now = new Date()) {
  if (!(await pageEnabled(q))) return null;
  const { rows: stations } = await q.query<{
    call_sign: string;
    reported_at: Date | null;
    checks: { name: string; ok: boolean; detail: string }[] | null;
    bursts: number;
    failed: number;
    prayers: number;
    last_burst_at: Date | null;
    last_error: string | null;
  }>(
    `with signs as (
       select call_sign from public.station_status
       union select upper(call_sign) from public.station_bursts where created_at > now() - interval '24 hours')
     select s.call_sign, st.reported_at, st.checks,
            count(b.id)::int as bursts, count(b.id) filter (where not b.ok)::int as failed,
            coalesce(sum(b.prayers), 0)::int as prayers, max(b.created_at) as last_burst_at,
            (select b2.error from public.station_bursts b2 where upper(b2.call_sign) = s.call_sign and not b2.ok
              and b2.created_at > now() - interval '24 hours' order by b2.id desc limit 1) as last_error
       from signs s
       left join public.station_status st on st.call_sign = s.call_sign
       left join public.station_bursts b on upper(b.call_sign) = s.call_sign and b.created_at > now() - interval '24 hours'
      group by s.call_sign, st.reported_at, st.checks
      order by s.call_sign`,
  );
  const { rows: queue } = await q.query<{ queued: number; sending: number; oldest: Date | null }>(
    `select count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'sending')::int as sending,
            min(created_at) filter (where status = 'queued') as oldest
       from public.radio_prayers where status in ('queued', 'sending')`,
  );
  const { rows: snr } = await q.query<{ call_sign: string; preset: string; reports: number; avg_db: number; min_db: number; last_at: Date }>(
    `select call_sign, preset, count(*)::int as reports, round(avg(snr_db), 1)::float8 as avg_db, min(snr_db)::float8 as min_db, max(heard_at) as last_at
       from public.channel_reports where heard_at > now() - interval '24 hours'
      group by call_sign, preset order by call_sign, preset`,
  );
  const { rows: failures } = await q.query<{ at: Date; call_sign: string | null; kind: 'burst' | 'prayer'; error: string | null }>(
    `(select created_at as at, call_sign, 'burst' as kind, error from public.station_bursts where not ok and created_at > now() - interval '24 hours')
     union all
     (select created_at as at, call_sign, 'prayer' as kind, error from public.radio_prayers
       where status = 'failed' and transmitter = 'station' and created_at > now() - interval '24 hours')
     order by at desc limit 10`,
  );
  // Listener nodes' heartbeats, and the latest decodes they reported (the last-heard list).
  const { rows: listeners } = await q.query<{ name: string; last_seen_at: Date | null }>(
    `select name, last_seen_at from public.radio_nodes where role = 'listener' and enabled order by name`,
  );
  const { rows: heard } = await q.query<{ node: string; call_sign: string; preset: string; snr_db: number; heard_at: Date }>(
    `select n.name as node, c.call_sign, c.preset, c.snr_db::float8 as snr_db, c.heard_at
       from public.channel_reports c join public.radio_nodes n on n.id = c.node_id
      order by c.id desc limit 15`,
  );
  const q0 = queue[0]!;
  return {
    listeners: listeners.map((l) => ({
      name: l.name,
      lastHeartbeat: l.last_seen_at?.toISOString() ?? null,
      silent: !l.last_seen_at || now.getTime() - l.last_seen_at.getTime() > LISTENER_STALE_MINUTES * 60_000,
    })),
    lastHeard: heard.map((r) => ({ node: r.node, callSign: r.call_sign, preset: r.preset, snrDb: r.snr_db, at: r.heard_at.toISOString() })),
    stations: stations.map(
      (s): StationHealth => ({
        callSign: s.call_sign,
        lastHeartbeat: s.reported_at?.toISOString() ?? null,
        silent: !s.reported_at || now.getTime() - s.reported_at.getTime() > STATUS_STALE_MINUTES * 60_000,
        checks: s.checks ?? [],
        bursts24h: s.bursts,
        failed24h: s.failed,
        prayers24h: s.prayers,
        lastBurstAt: s.last_burst_at?.toISOString() ?? null,
        lastError: s.last_error,
      }),
    ),
    queue: { queued: q0.queued, sending: q0.sending, oldestMinutes: q0.oldest ? Math.round((now.getTime() - q0.oldest.getTime()) / 60_000) : null },
    snr: snr.map((r) => ({ callSign: r.call_sign, preset: r.preset, reports: r.reports, avgDb: r.avg_db, minDb: r.min_db, lastAt: r.last_at.toISOString() })),
    failures: failures.map((f) => ({ at: f.at.toISOString(), callSign: f.call_sign, kind: f.kind, error: f.error ?? '' })),
  };
}
