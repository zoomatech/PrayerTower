# Background jobs: retries, failed jobs and alerts

The worker (`apps/server/src/worker.ts`, Graphile Worker) runs these jobs in the background:

- push notifications
- AI moderation scans
- radio prayers
- after-prayer work
- reminders and scheduled gifts
- the weekly emails and reports
- the nightly ledger check
- data retention

## Retries with backoff

A job that throws is tried again. Graphile Worker waits `exp(min(10, attempt))` seconds between tries ([Graphile Worker: Exponential backoff](https://worker.graphile.org/docs/exponential-backoff)):

| Try | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---|---|---|---|---|---|---|---|---|---|
| Wait before the next try | 3 s | 7 s | 20 s | 55 s | 2.5 min | 7 min | 18 min | 50 min | 2.3 h | 6 h |

The number of tries per task is set in `apps/server/src/jobs.ts` (`MAX_ATTEMPTS`). The old default was 25 tries, which spread over several days.

- **Push notifications:** 6 tries, about 10 minutes. After that the push is stale, but the notice is still in the app.
- **Radio prayers and after-prayer work:** 8 tries.
- **Moderation scans and everything else:** 10 tries, about 2 hours.
- **Cron jobs** (in `tasks.ts`) carry `?max=` ([Graphile Worker: Cron](https://worker.graphile.org/docs/cron)):
  - jobs that run every few minutes: 3 tries, because the next run comes soon anyway
  - daily and weekly jobs: 10 tries

## Failed jobs (Admin → Background jobs)

A job that uses all its tries stays in the queue as **failed** and doesn't run again. Admin → Background jobs lists:

- **Retrying:** each task with jobs waiting for another try, how many times they have been tried, and the last error.
- **Failed jobs:** the task, its tries, when it failed, and the first line of the error.
  - **Retry** runs the job now with a fresh set of tries (`graphile_worker.reschedule_jobs`).
  - **Discard** removes it (`graphile_worker.complete_jobs`).
  - Both are recorded in the audit log ([Graphile Worker: Admin functions](https://worker.graphile.org/docs/admin-functions)).
- **API:** `GET /admin/jobs`, `POST /admin/jobs/:id/retry` and `POST /admin/jobs/:id/discard`.

## Alerts

Every 10 minutes, `jobs_failure_check` sends every admin a **Background jobs are failing** notice (in-app and push) when either of these happens:

- **A job ran out of tries.** Each failed job is reported once (`public.job_alerts`).
- **A task keeps failing.** That means 3 or more of its jobs are retrying and have already been tried 3 or more times. This is reported at most once an hour.

Like the ledger alert, this notice can't be switched off. The worker log also prints a warning. With Sentry set up (`SENTRY_DSN`), each error is reported there too.
