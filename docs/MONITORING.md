# Monitoring: health checks, uptime alerts and Admin → Operations

Set up 2026-10-28. Three layers, from the outside in:

| What | Where | Who gets told |
|---|---|---|
| Is the API answering? | `GET /health` | The uptime monitor emails you (set up below) |
| Is the worker running and is the job queue moving? | `GET /health/ready` | The uptime monitor emails you |
| Worker, queue, server errors and the radio station in detail | Admin → **Operations** (`GET /admin/ops`) | Admins get an in-app alert at most once an hour per problem |
| Crashes with stack traces | Sentry, if `SENTRY_DSN` is set | Sentry emails you |
| Request counts, latency, queue depth | `GET /metrics` (Prometheus, needs `METRICS_TOKEN`) | Whatever scrapes it |

## Health checks

- **`GET /health`**: `{"ok":true}` when the API is running and can reach the database. Fly.io already checks it every 30 seconds and restarts a machine that fails (`[[http_service.checks]]` in `fly.toml`, [Fly configuration reference](https://fly.io/docs/reference/configuration/)).
- **`GET /health/ready`**: `200 {"ok":true,"problems":[]}`, or `503` with the problems when:
  - `worker_down`: the worker hasn't checked in for 3 minutes. It checks in every minute (`ops_heartbeat` job). When the worker stops, pushes, reminders and radio prayers stop with it, and the worker can't alert about itself. That is why this one goes to the uptime monitor.
  - `jobs_overdue`: 5 or more jobs should have started over 2 minutes ago.

  Don't point Fly's own check at `/health/ready`. A stopped worker would make Fly restart the API, which doesn't help.

## Uptime monitor (Steve: 10 minutes, free)

Use either service. Both have free plans that allow commercial use.

- **[UptimeRobot](https://uptimerobot.com/pricing/)**: the free plan has 50 monitors at a 5-minute interval and is "good for personal and commercial projects. No credit card required!"
- **[Better Stack](https://betterstack.com/docs/uptime/check-frequency.md)**: free plans check every 3 minutes.

Add two HTTP monitors, both alerting your email:

1. `https://<API host>/health`, named "Prayer Tower API".
2. `https://<API host>/health/ready`, named "Prayer Tower worker". It alerts on any status other than 200.

Optionally add a third for the web app's address.

## Admin → Operations

Admins open it from the Admin screen. It refreshes every 30 seconds and shows:

- **Overall:** "Everything is running", or each problem in plain words.
- **Server:** how long the database took to answer.
- **Background worker:** running or not, and when it last checked in.
- **Job queue:** waiting, running, overdue (with the oldest), ran out of tries, retrying. To retry or discard failed jobs, use Background jobs on the Admin screen ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)).
- **Server errors:** 5xx responses in the last hour and 24 hours, and the last 10, each with its route pattern (`/posts/:id`). They never include ids, member names or request text.
- **Radio:** the mode (log only or station); queued, sending, sent and failed in the last 24 hours; and when the last prayer went out. In station mode it also shows when the station last asked for work. A station counts as "not running" when it hasn't asked for 30 minutes while prayers are waiting.

## In-app alerts

The `ops_check` job runs every 5 minutes. It notifies every admin when:

- the queue is overdue,
- there are 10 or more server errors in an hour, or
- the radio station is silent while prayers wait.

Each problem alerts at most once an hour. The alert is called "Prayer Tower needs attention", and admins can't turn it off. Failed jobs already alert through `jobs_failure_check` ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)). The job also deletes server-error rows older than 30 days.

The thresholds are in `LIMITS` in `apps/server/src/modules/ops/index.ts`:

| Setting | Default |
|---|---|
| Worker counts as stopped after | 3 minutes |
| A job counts as overdue after | 2 minutes |
| Overdue jobs before alerting | 5 |
| Server errors per hour before alerting | 10 |
| Station counts as silent after | 30 minutes |
| Server errors kept for | 30 days |

## Prometheus metrics

`/metrics` already reported request counts and latency by route, `job_queue_pending` and `db_pool_waiting`. It now also reports:

- `worker_heartbeat_age_seconds` (-1 if the worker never checked in)
- `radio_prayers_queued`
