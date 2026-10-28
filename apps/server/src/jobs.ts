import type { Queryable } from './db.js';

/**
 * How many times each queued task is tried. Graphile Worker waits
 * exp(min(10, attempt)) seconds between tries (3 s, 7 s, 20 s, 55 s, 2.5 min,
 * 7 min, 18 min, 50 min, then about 6 h), so 6 tries span about 10 minutes and
 * 10 about 2 hours. A job that runs out of tries stays in the queue as failed,
 * shows under Admin → Background jobs, and alerts admins (modules/jobs).
 * https://worker.graphile.org/docs/exponential-backoff
 */
export const MAX_ATTEMPTS: Record<string, number> = {
  // A push that can't go out in ~10 minutes is stale; the in-app notice stays.
  notifications_send_push: 6,
  prayer_actions_after_praying_now: 8,
  moderation_scan: 10,
  radio_transmit: 8,
};
export const DEFAULT_MAX_ATTEMPTS = 10;

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
    [task, JSON.stringify(payload), opts.jobKey ?? null, opts.runAt ?? null, opts.maxAttempts ?? MAX_ATTEMPTS[task] ?? DEFAULT_MAX_ATTEMPTS],
  );
}
