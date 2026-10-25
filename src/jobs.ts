import type { Queryable } from './db.js';

/**
 * Enqueue a Graphile Worker job. Pass the transaction client so the job is
 * committed atomically with the rows that caused it.
 */
export async function enqueue(
  q: Queryable,
  task: string,
  payload: Record<string, unknown>,
  opts: { jobKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<void> {
  await q.query(
    `select graphile_worker.add_job($1, $2::json, job_key := $3, run_at := $4, max_attempts := $5)`,
    [task, JSON.stringify(payload), opts.jobKey ?? null, opts.runAt ?? null, opts.maxAttempts ?? 25],
  );
}
