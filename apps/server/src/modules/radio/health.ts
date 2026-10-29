// Station health alerts (Admin → Radio; docs/STATION_OPERATOR_GUIDE.md, "Health alerts").
// The station reports what only it can see (is there an audio device, does the
// radio key) to POST /station/status every minute or so. The server adds what
// it can see: an empty queue, prayers waiting longer than station_overdue_minutes,
// a failed last burst, and a station that stopped checking in.
// Off until an admin turns on station_alerts_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { stationSettings } from './index.js';

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

export type AlertKind = 'no_audio_device' | 'ptt_failed' | 'burst_failed' | 'burst_overdue' | 'station_silent' | 'queue_empty';

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

/** Every alert that holds now, problems first. Empty when the switch is off or the radio is not in station mode. */
export async function alerts(q: Queryable, now = new Date()): Promise<{ enabled: boolean; overdueMinutes: number; alerts: StationAlert[] }> {
  const s = await settings(q);
  const out = { enabled: s.station_alerts_enabled, overdueMinutes: s.station_overdue_minutes, alerts: [] as StationAlert[] };
  if (!s.station_alerts_enabled || (await stationSettings(q)).radio_transmitter !== 'station') return out;
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

  const { rows: q2 } = await q.query<{ queued: number; oldest: Date | null }>(
    `select count(*)::int as queued, min(created_at) as oldest from public.radio_prayers where status = 'queued'`,
  );
  const { queued, oldest } = q2[0]!;
  if (!queued) list.push({ kind: 'queue_empty', level: 'info', detail: 'Nothing is waiting to go out.', callSign: null, since: null });
  else if (oldest && now.getTime() - oldest.getTime() > s.station_overdue_minutes * 60_000) {
    const mins = Math.round((now.getTime() - oldest.getTime()) / 60_000);
    list.push({ kind: 'burst_overdue', level: 'problem', detail: `${queued} waiting; the oldest for ${mins} min.`, callSign: null, since: oldest.toISOString() });
  }
  list.sort((a, b) => (a.level === b.level ? 0 : a.level === 'problem' ? -1 : 1));
  return out;
}
