// Background job health: the jobs that ran out of tries (a dead-letter list
// admins can retry or discard), the ones still retrying, and an alert to every
// admin when jobs keep failing. Retries and backoff are Graphile Worker's own,
// with the number of tries per task in jobs.ts (MAX_ATTEMPTS).
// https://worker.graphile.org/docs/admin-functions
import type { Task } from 'graphile-worker';
import type { Queryable } from '../../db.js';
import { notify } from '../notifications/index.js';

export interface FailedJob {
  id: string;
  task: string;
  attempts: number;
  maxAttempts: number;
  /** First line of the last error, at most 300 characters. */
  lastError: string | null;
  key: string | null;
  createdAt: string;
  failedAt: string;
}

export interface RetryingTask {
  task: string;
  jobs: number;
  /** The most tries any of them has used so far. */
  attempts: number;
  lastError: string | null;
}

const firstLine = (s: string | null) => (s ? s.split('\n')[0]!.slice(0, 300) : null);

/** Jobs that used every try and won't run again unless an admin retries them. */
export async function failed(q: Queryable, limit = 50): Promise<FailedJob[]> {
  const { rows } = await q.query<{ id: string; task_identifier: string; attempts: number; max_attempts: number; last_error: string | null; key: string | null; created_at: Date; updated_at: Date }>(
    `select id::text, task_identifier, attempts, max_attempts, last_error, key, created_at, updated_at
       from graphile_worker.jobs where attempts >= max_attempts and locked_at is null
      order by updated_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    task: r.task_identifier,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    lastError: firstLine(r.last_error),
    key: r.key,
    createdAt: r.created_at.toISOString(),
    failedAt: r.updated_at.toISOString(),
  }));
}

/** Tasks with jobs that failed at least once and are waiting for another try. */
export async function retrying(q: Queryable): Promise<RetryingTask[]> {
  const { rows } = await q.query<{ task: string; jobs: number; attempts: number; last_error: string | null }>(
    `select task_identifier as task, count(*)::int as jobs, max(attempts)::int as attempts,
            (array_agg(last_error order by updated_at desc))[1] as last_error
       from graphile_worker.jobs where attempts > 0 and attempts < max_attempts
      group by task_identifier order by count(*) desc`,
  );
  return rows.map((r) => ({ task: r.task, jobs: r.jobs, attempts: r.attempts, lastError: firstLine(r.last_error) }));
}

/** Run a failed job again now, with a fresh set of tries. False if it isn't a failed job. */
export async function retry(q: Queryable, id: string): Promise<boolean> {
  const { rows } = await q.query(
    `select id from graphile_worker.reschedule_jobs(
       (select array_agg(id) from graphile_worker.jobs where id = $1::bigint and attempts >= max_attempts and locked_at is null),
       run_at := now(), attempts := 0)`,
    [id],
  );
  return rows.length > 0;
}

/** Remove a failed job for good. False if it isn't a failed job. */
export async function discard(q: Queryable, id: string): Promise<boolean> {
  const { rows } = await q.query(
    `select id from graphile_worker.complete_jobs(
       (select array_agg(id) from graphile_worker.jobs where id = $1::bigint and attempts >= max_attempts and locked_at is null))`,
    [id],
  );
  return rows.length > 0;
}

/** A task counts as failing repeatedly with this many jobs retrying at once, each tried this often. */
export const REPEATED = { jobs: 3, attempts: 3 };

/**
 * Alert admins about jobs that newly ran out of tries, and about tasks failing
 * over and over. Each failed job is reported once (public.job_alerts); a
 * repeatedly failing task at most once an hour.
 */
export async function checkFailures(q: Queryable, now = new Date()): Promise<{ newlyFailed: number; repeating: string[] }> {
  const { rows: fresh } = await q.query<{ id: string; task: string }>(
    `insert into public.job_alerts (job_id, task)
     select j.id, j.task_identifier from graphile_worker.jobs j
      where j.attempts >= j.max_attempts and j.locked_at is null
     on conflict (job_id) do nothing
     returning job_id::text as id, task`,
  );
  // Forget reports about jobs that are long gone.
  await q.query(`delete from public.job_alerts a where a.alerted_at < now() - interval '30 days' and not exists (select 1 from graphile_worker.jobs j where j.id = a.job_id)`);
  const repeating = (await retrying(q)).filter((r) => r.jobs >= REPEATED.jobs && r.attempts >= REPEATED.attempts).map((r) => r.task);
  if (!fresh.length && !repeating.length) return { newlyFailed: 0, repeating };

  const tasks = [...new Set([...fresh.map((f) => f.task), ...repeating])].sort();
  const hour = now.toISOString().slice(0, 13);
  const { rows: admins } = await q.query<{ user_id: string }>(`select distinct user_id from public.user_roles where role = 'admin'`);
  for (const a of admins) {
    // job_alert is in no notification category, so admins can't turn it off.
    await notify(q, a.user_id, {
      kind: 'job_alert',
      title: 'Background jobs are failing',
      body: `${fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'job' : 'jobs'} ran out of tries. ` : ''}Failing: ${tasks.join(', ')}. Open Admin → Background jobs to retry or discard.`,
      data: { tasks },
      // Newly failed jobs always alert; a task that keeps retrying, once an hour.
      dedupeKey: fresh.length ? `job_alert:${fresh.map((f) => f.id).join(',').slice(0, 200)}` : `job_alert:${hour}:${tasks.join(',')}`,
      t: { key: 'job_alert', params: { count: fresh.length, tasks: tasks.join(', ') } },
    });
  }
  return { newlyFailed: fresh.length, repeating };
}

export function failureCheckTask(q: Queryable): Task {
  return async (_payload, helpers) => {
    const r = await checkFailures(q);
    if (r.newlyFailed || r.repeating.length) helpers.logger.warn(`job check: ${r.newlyFailed} newly failed, repeating: ${r.repeating.join(', ') || 'none'}`);
  };
}
