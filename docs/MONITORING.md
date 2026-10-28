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
- **Server errors:** unexpected failures (500) in the last hour and 24 hours, and the last 10, each with its route pattern (`/posts/:id`). They never include ids, member names or request text. Deliberate answers aren't counted: a feature that isn't set up (for example 503 when SMTP is missing) and `/health/ready`'s own 503 during an outage.
- **Radio:** the mode (log only or station); queued, sending, sent and failed in the last 24 hours; and when the last prayer went out. In station mode it also shows when the station last asked for work. A station counts as "not running" when it hasn't asked for 30 minutes while prayers are waiting.

## In-app alerts

The `ops_check` job runs every 5 minutes. It notifies every admin when:

- the queue is overdue,
- there are 10 or more server errors in an hour, or
- the radio station is silent while prayers wait.

Each problem alerts at most once an hour. Alerts, crisis flags and moderation notices are pushed even during a member's quiet hours. The alert is called "Prayer Tower needs attention", and admins can't turn it off. Failed jobs already alert through `jobs_failure_check` ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)). The job also deletes server-error rows older than 30 days.

The thresholds are in `LIMITS` in `apps/server/src/modules/ops/index.ts`:

| Setting | Default |
|---|---|
| Worker counts as stopped after | 3 minutes |
| A job counts as overdue after | 2 minutes |
| Overdue jobs before alerting | 5 |
| Server errors per hour before alerting | 10 |
| Station counts as silent after | 30 minutes |
| Server errors kept for | 30 days |

## Alert test (2026-10-28, staging)

Each alert was triggered for real on the staging stack:

| Alert | How it was triggered | What happened | Goes to |
|---|---|---|---|
| Worker stopped | Stopped the worker process | `/health/ready` turned `503 worker_down` after 2 min 40 s | Uptime monitor → your email |
| Jobs piling up | 5 jobs no worker could run, due 5 minutes earlier | `/health/ready` 503 `jobs_overdue`; in-app alert at the next 5-minute check | Uptime monitor; admins in the app (and by push) |
| Server errors | The bad release from the rollback rehearsal, with the feed opened 12 times (12 real 500s) | In-app alert "The server is returning errors" | Admins |
| A job out of tries | A radio job with a broken id and one try | "Background jobs are failing" at the next 10-minute check | Admins |
| Radio station silent | Station mode, a prayer waiting, station last seen an hour ago | "The radio station has stopped checking in" | Admins |
| Crash reports | The bad release with `SENTRY_DSN` pointed at a stand-in Sentry server | The error arrived with the route (`GET /feed`), method and URL, and no headers, body or user | Sentry → your email |

What the test fixed:

- `/health/ready`'s own 503s, and "not set up" answers, were counted as server errors. So while the worker was down, the uptime monitor's checks alone would have set off a false "The server is returning errors" alert.
- Quiet hours held back every push, including crisis flags meant for moderators "at once". Safety and staff alerts now come through.

Ready, but they need your accounts:

- **Uptime emails:** UptimeRobot counts only "any HTTP 2xx or 3xx response" as up, and retries a failure three times, 10 seconds apart, before it reports the monitor down ([UptimeRobot: Debugging a monitor that shows as down](https://help.uptimerobot.com/en/articles/11358466-debugging-a-monitor-that-shows-as-down)). `/health/ready` answers 503 when there is a problem, so it will alert. To test once the monitors exist, run `fly scale count worker=0 -a prayertower-api`. The email should arrive within about 10 minutes. Then run `fly scale count worker=1 -a prayertower-api`.
- **Push for alerts:** needs `EXPO_ACCESS_TOKEN` and the admin's phone signed in once.
- **Sentry emails:** needs `SENTRY_DSN`. Then check Sentry → Alerts, so new issues email you.

## Prometheus metrics

`/metrics` already reported request counts and latency by route, `job_queue_pending` and `db_pool_waiting`. It now also reports:

- `worker_heartbeat_age_seconds` (-1 if the worker never checked in)
- `radio_prayers_queued`
