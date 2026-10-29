// Operator alerts (docs/STATION_OPERATOR_GUIDE.md, "Operator alerts"): every
// two minutes, the station health problems (health.ts) that have just started
// go to each radio operator and admin as a push notice, once per problem, and
// a quiet in-app "back to normal" follows when it clears. Information-only
// alerts (an empty queue, a quiet listener node) are never pushed. Off until an
// admin turns on operator_alerts_enabled; it works whether or not the health
// alerts card in Admin → Radio is on.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import * as notifications from '../notifications/index.js';
import * as health from './health.js';

const TITLES: Record<health.AlertKind, string> = {
  no_audio_device: 'Station: no sound card',
  ptt_failed: 'Station: the radio did not key',
  burst_failed: 'Station: the last burst failed',
  burst_overdue: 'Station: prayers are overdue',
  station_silent: 'Station stopped reporting',
  listener_silent: 'A listener node is quiet',
  queue_empty: 'Nothing is waiting',
};

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select operator_alerts_enabled as on from public.token_settings');
  return rows[0]!.on;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.token_settings set operator_alerts_enabled = $1', [on]);
  // Turning it off forgets what was announced, so turning it on again starts fresh.
  if (!on) await q.query('delete from public.radio_open_alerts');
}

const keyOf = (a: health.StationAlert) => `${a.kind}:${a.callSign ?? ''}`;

/** One pass: announce new problems, say when old ones clear. Returns what it sent. */
export async function check(q: Queryable, now = new Date()): Promise<{ opened: string[]; cleared: string[] }> {
  if (!(await enabled(q))) return { opened: [], cleared: [] };
  const problems = (await health.alerts(q, now, { force: true })).alerts.filter((a) => a.level === 'problem');
  const current = new Map(problems.map((a) => [keyOf(a), a]));
  const { rows: open } = await q.query<{ key: string }>('select key from public.radio_open_alerts');
  const was = new Set(open.map((r) => r.key));
  const opened = [...current.keys()].filter((k) => !was.has(k));
  const cleared = [...was].filter((k) => !current.has(k));
  if (!opened.length && !cleared.length) return { opened, cleared };

  const { rows: to } = await q.query<{ user_id: string }>(
    `select distinct user_id from public.user_roles where role in ('radio_operator', 'admin') order by user_id`,
  );
  for (const key of opened) {
    const a = current.get(key)!;
    await q.query('insert into public.radio_open_alerts (key, opened_at) values ($1, $2) on conflict do nothing', [key, now]);
    // Kept for the weekly station report (station-report.ts).
    await q.query('insert into public.radio_alert_history (kind, call_sign, detail, opened_at) values ($1, $2, $3, $4)', [a.kind, a.callSign ?? null, a.detail ?? null, now]);
    for (const { user_id } of to) {
      await notifications.notify(q, user_id, {
        kind: 'radio_alert',
        title: TITLES[a.kind],
        body: [a.callSign, a.detail].filter(Boolean).join(': ') || 'Open the operator console or Admin → Radio.',
        data: { alert: a.kind, callSign: a.callSign },
        dedupeKey: `radio_alert:${key}:${now.toISOString()}`,
      });
    }
  }
  for (const key of cleared) {
    await q.query('delete from public.radio_open_alerts where key = $1', [key]);
    const [kind, callSign] = key.split(':') as [health.AlertKind, string];
    for (const { user_id } of to) {
      await notifications.notify(q, user_id, {
        kind: 'radio_alert_cleared',
        title: `Back to normal: ${TITLES[kind] ?? kind}`,
        body: callSign ? `${callSign} is fine again.` : 'This has cleared.',
        data: { alert: kind, callSign: callSign || null },
        dedupeKey: `radio_alert_cleared:${key}:${now.toISOString()}`,
        quiet: true,
      });
    }
  }
  return { opened, cleared };
}

export const operatorAlertsTask =
  (q: Queryable): Task =>
  async () => {
    await check(q);
  };
