// Operations status (docs/MONITORING.md): is the worker running, is the job
// queue moving, how many server errors, and is the radio station checking in.
// Admin → Operations shows it, GET /health/ready answers uptime monitors, and
// ops_check alerts admins in the app.
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { notify } from '../notifications/index.js';
import { stationSettings } from '../radio/index.js';

/** Defaults; change here. A job "overdue" should have started that long ago. */
export const LIMITS = {
  workerStaleSeconds: 180,
  overdueSeconds: 120,
  overdueJobs: 5,
  errorsPerHour: 10,
  stationStaleMinutes: 30,
  keepErrorsDays: 30,
};

export type Heartbeat = 'worker' | 'station';

export async function beat(q: Queryable, name: Heartbeat) {
  await q.query(`insert into public.ops_heartbeats (name) values ($1) on conflict (name) do update set seen_at = now()`, [name]);
}

export async function recordError(q: Queryable, e: { method: string; route: string; status: number }) {
  await q.query(`insert into public.server_errors (method, route, status) values ($1, $2, $3)`, [e.method, e.route.slice(0, 200), e.status]);
}

export type Problem = 'worker_down' | 'jobs_overdue' | 'jobs_failed' | 'server_errors' | 'station_silent';

export interface OpsStatus {
  checkedAt: string;
  database: { ms: number };
  worker: { lastSeen: string | null; ok: boolean };
  queue: { waiting: number; running: number; overdue: number; oldestOverdueSeconds: number; failed: number; retrying: number };
  errors: { lastHour: number; last24h: number; recent: { at: string; method: string; route: string; status: number }[] };
  radio: {
    mode: 'log' | 'station';
    queued: number;
    sending: number;
    sentToday: number;
    failedToday: number;
    lastSentAt: string | null;
    station: { lastSeen: string | null; ok: boolean | null };
  };
  problems: Problem[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function status(q: Queryable, now = new Date()): Promise<OpsStatus> {
  const t0 = performance.now();
  await q.query('select 1');
  const ms = Math.round(performance.now() - t0);

  const { rows: beats } = await q.query<{ name: Heartbeat; seen_at: Date }>(`select name, seen_at from public.ops_heartbeats`);
  const seen = (n: Heartbeat) => beats.find((b) => b.name === n)?.seen_at ?? null;
  const ageSeconds = (d: Date | null) => (d ? (now.getTime() - d.getTime()) / 1000 : Infinity);

  const { rows: jobs } = await q.query<{ waiting: number; running: number; overdue: number; oldest: number | null; failed: number; retrying: number }>(
    `select count(*) filter (where locked_at is null and attempts < max_attempts)::int as waiting,
            count(*) filter (where locked_at is not null)::int as running,
            count(*) filter (where locked_at is null and attempts < max_attempts and run_at < $1::timestamptz - make_interval(secs => $2))::int as overdue,
            extract(epoch from $1::timestamptz - min(run_at) filter (where locked_at is null and attempts < max_attempts and run_at < $1::timestamptz - make_interval(secs => $2)))::int as oldest,
            count(*) filter (where attempts >= max_attempts and locked_at is null)::int as failed,
            count(*) filter (where attempts > 0 and attempts < max_attempts and locked_at is null)::int as retrying
       from graphile_worker.jobs`,
    [now, LIMITS.overdueSeconds],
  );
  const j = jobs[0]!;

  const { rows: errs } = await q.query<{ hour: number; day: number }>(
    `select count(*) filter (where at > $1::timestamptz - interval '1 hour')::int as hour, count(*)::int as day
       from public.server_errors where at > $1::timestamptz - interval '24 hours'`,
    [now],
  );
  const { rows: recent } = await q.query<{ at: Date; method: string; route: string; status: number }>(
    `select at, method, route, status from public.server_errors order by at desc limit 10`,
  );

  const settings = await stationSettings(q);
  const { rows: radio } = await q.query<{ queued: number; sending: number; sent: number; failed: number; last: Date | null }>(
    `select count(*) filter (where status = 'queued')::int as queued,
            count(*) filter (where status = 'sending')::int as sending,
            count(*) filter (where status = 'transmitted' and transmitted_at > $1::timestamptz - interval '24 hours')::int as sent,
            count(*) filter (where status = 'failed' and created_at > $1::timestamptz - interval '24 hours')::int as failed,
            max(transmitted_at) as last
       from public.radio_prayers`,
    [now],
  );
  const r = radio[0]!;
  const station = seen('station');
  // The station only matters in station mode; a quiet station with nothing to send is fine.
  const stationOk = settings.radio_transmitter === 'station' ? ageSeconds(station) < LIMITS.stationStaleMinutes * 60 || r.queued === 0 : null;

  const worker = seen('worker');
  const workerOk = ageSeconds(worker) < LIMITS.workerStaleSeconds;
  const problems: Problem[] = [];
  if (!workerOk) problems.push('worker_down');
  if (j.overdue >= LIMITS.overdueJobs) problems.push('jobs_overdue');
  if (j.failed > 0) problems.push('jobs_failed');
  if (errs[0]!.hour >= LIMITS.errorsPerHour) problems.push('server_errors');
  if (stationOk === false) problems.push('station_silent');

  return {
    checkedAt: now.toISOString(),
    database: { ms },
    worker: { lastSeen: iso(worker), ok: workerOk },
    queue: { waiting: j.waiting, running: j.running, overdue: j.overdue, oldestOverdueSeconds: j.oldest ?? 0, failed: j.failed, retrying: j.retrying },
    errors: { lastHour: errs[0]!.hour, last24h: errs[0]!.day, recent: recent.map((e) => ({ ...e, at: e.at.toISOString() })) },
    radio: {
      mode: settings.radio_transmitter,
      queued: r.queued,
      sending: r.sending,
      sentToday: r.sent,
      failedToday: r.failed,
      lastSentAt: iso(r.last),
      station: { lastSeen: iso(station), ok: stationOk },
    },
    problems,
  };
}

/** What uptime monitors need: 503 when the worker is down or jobs are piling up. */
export function ready(s: OpsStatus) {
  const failing = s.problems.filter((p) => p === 'worker_down' || p === 'jobs_overdue');
  return { ok: failing.length === 0, problems: failing };
}

const TEXT: Record<Exclude<Problem, 'jobs_failed'>, string> = {
  worker_down: 'The background worker has stopped checking in. Pushes, reminders and radio prayers wait until it is back.',
  jobs_overdue: 'Background jobs are waiting longer than they should.',
  server_errors: 'The server is returning errors.',
  station_silent: 'The radio station has stopped checking in while prayers wait to be sent.',
};

/**
 * Every 5 minutes (worker): alert admins in the app, at most once an hour per
 * problem, and drop old error rows. Failed jobs already alert through
 * jobs_failure_check. A stopped worker can't alert about itself, so
 * /health/ready reports that to the uptime monitor.
 */
export async function check(q: Queryable, now = new Date()) {
  const s = await status(q, now);
  await q.query(`delete from public.server_errors where at < $1::timestamptz - make_interval(days => $2)`, [now, LIMITS.keepErrorsDays]);
  const alerts = s.problems.filter((p): p is keyof typeof TEXT => p in TEXT);
  if (!alerts.length) return { status: s, alerted: [] as Problem[] };
  const hour = now.toISOString().slice(0, 13);
  const body = `${alerts.map((p) => TEXT[p]).join(' ')} Open Admin → Operations.`;
  const { rows: admins } = await q.query<{ user_id: string }>(`select distinct user_id from public.user_roles where role = 'admin'`);
  for (const a of admins) {
    // ops_alert is in no notification category, so admins can't turn it off.
    await notify(q, a.user_id, { kind: 'ops_alert', title: 'Prayer Tower needs attention', body, data: { problems: alerts }, dedupeKey: `ops_alert:${hour}:${alerts.join(',')}` });
  }
  return { status: s, alerted: alerts };
}

export function heartbeatTask(q: Queryable): Task {
  return async () => {
    await beat(q, 'worker');
  };
}

export function checkTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const r = await check(q);
    if (r.alerted.length) helpers.logger.warn(`ops check: ${r.alerted.join(', ')}`);
  };
}
