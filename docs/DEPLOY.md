# Deploying the pilot

**Fastest path:** `scripts/go-live.sh` deploys to Fly.io (or use `render.yaml` on Render) with Supabase Cloud. See [GO_LIVE.md](GO_LIVE.md). This page covers a single server you run yourself.

The pilot runs as two pieces: **Supabase** (Postgres, Auth, Storage) and **one small server** running the API and worker with Docker Compose behind Caddy for HTTPS.

## 1. Supabase

Pick one:

- **Supabase Cloud, Pro plan (recommended for the pilot).** Daily backups kept 7 days, with point-in-time recovery as an add-on. ([Supabase backups](https://supabase.com/docs/guides/platform/backups))
- **Supabase Cloud, Free plan.** No automatic daily backups; run `scripts/backup-db.sh` on a schedule and keep the dumps off the server. ([Supabase backups](https://supabase.com/docs/guides/platform/backups))
- **Self-hosted on the same server.** Minimum 2 CPU cores, 4 GB RAM, 40 GB SSD (4 cores, 8 GB, 80 GB recommended). Generate new keys before first start, set real URLs, put HTTPS in front, and configure production SMTP. Backups are yours to run (`scripts/backup-db.sh`). ([Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker))

Then apply this repo's migrations:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

In Supabase Auth settings, set the Site URL and a production SMTP sender so sign-up emails arrive.

## 2. API and worker server

On a small Linux server with Docker:

```bash
git clone https://github.com/zoomatech/PrayerTower.git && cd PrayerTower
cp apps/server/.env.example apps/server/.env
# Set DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY, CORS_ORIGINS,
# PUSH_ENABLED=1, EXPO_ACCESS_TOKEN (optional), OPENAI_API_KEY or ANTHROPIC_API_KEY with MODERATION_PROVIDER (optional).
docker compose up -d --build
curl -s localhost:3000/health   # {"ok":true}
```

HTTPS: install Caddy, copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, set your domain, and reload Caddy. It gets and renews the certificate automatically once DNS points at the server and ports 80 and 443 are open. ([Caddy reverse proxy quick start](https://caddyserver.com/docs/quick-starts/reverse-proxy))

The API runs migrations for the job queue on start. Scale the worker with `docker compose up -d --scale worker=2`.

## 3. Backups

- Supabase Pro: automatic (above). Still take a monthly off-site dump with `scripts/backup-db.sh`.
- Free or self-hosted: run `scripts/backup-db.sh` daily from cron and copy the folder off the server.
- Test a restore before the pilot starts, and monthly after: `scripts/restore-drill.sh` (see [BACKUP_RESTORE.md](BACKUP_RESTORE.md)). CI runs the same drill on every pull request.

## Pilot report for sponsors

Admin → Pilot metrics → **Sponsor report** downloads a one-page HTML report of the last 12 weeks: headline numbers for the last full week against the week before, a weekly prayer chart and the week-by-week table. Open it in any browser and print or "Save as PDF". It holds counts only, with no names or request text. The same report is at `GET /admin/pilot-report?weeks=12&format=html&lang=en|es` (admin token). To email it every Monday at 08:00 UTC, set `SPONSOR_REPORT_TO` (comma-separated) with `SMTP_URL` on the worker.

## AI moderation

`MODERATION_PROVIDER` picks who checks new posts, comments, encouragements, messages and events: `openai` (default; [moderation endpoint](https://developers.openai.com/api/docs/guides/moderation), `omni-moderation-latest`, needs `OPENAI_API_KEY`), `claude` (needs `ANTHROPIC_API_KEY`) or `off`. With no key for the chosen provider nothing is sent and moderation is people-only. The Claude provider asks `MODERATION_CLAUDE_MODEL` (default `claude-opus-5-5`, effort `low`) for a JSON verdict with [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) in the same category names OpenAI uses, so auto-hide and crisis routing work the same. It opts into server-side [refusal fallbacks](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) (`fallbacks: "default"`); text that every model declines goes to the moderation queue as "refused". OpenAI's endpoint is free; Claude bills per token, so for volume set `MODERATION_CLAUDE_MODEL=claude-haiku-5-5`.

## Data retention

The worker runs `retention_purge` every day at 03:30 UTC. Periods are in days, set on the worker; `0` turns that purge off.

| Env var | Default | What goes |
| --- | --- | --- |
| `RETENTION_REMOVED_DAYS` | 90 | Text and photos of requests, comments, encouragements, messages and events a moderator removed, counted from the decision. The row stays as "(removed)" so moderation records still point at something. Content under a pending appeal is kept. |
| `RETENTION_NOTIFICATION_DAYS` | 90 | In-app notifications, read or not. |
| `RETENTION_QUEUE_DAYS` | 30 | Handled deletion requests from the website (they hold an email address), push tokens Expo reported dead, and finished, cancelled or failed scheduled gifts. |

Things that are erased right away and need no job: a member's own deleted requests and comments, and deleted accounts. The app's offline queue lives only on the phone and drops actions older than 3 days (`apps/mobile/src/lib/offline.ts`). Server logs and database backups are kept by the host; set their retention there (Supabase backups follow the plan's window).

## Weekly email digest

Members can turn on a Sunday email (Me → Weekly email; off by default) listing prayers answered that week on requests they prayed for, plus how their promises went. Set `SMTP_URL` (for example `smtps://user:pass@smtp.example.com:465`) and `MAIL_FROM` on the worker; without `SMTP_URL` nothing is sent. Any SMTP provider works. The worker sends at 19:00 UTC on Sundays, once per member per ISO week, and skips members with nothing to report. URL format: [Nodemailer SMTP transport](https://nodemailer.com/smtp/). Supabase's own SMTP setting only covers sign-in emails.

## Staging

A second Supabase project plus a second API on the same server. See [STAGING.md](STAGING.md).

## 4. Monitoring

- **Uptime:** point an uptime checker at `https://<api-domain>/health` and at `/health/ready`, which also fails when the worker stops. Admin → Operations shows the worker, queue, server errors and radio station. See [MONITORING.md](MONITORING.md).
- **Errors:** `docker compose logs -f api worker` shows request errors and failed jobs. Graphile Worker retries failed jobs with backoff. Logs record method, route, status and timing. They never include bodies or sign-in tokens. Set `LOG_LEVEL` to change the detail (default `info`).
- **Error reporting (optional):** set `SENTRY_DSN` for the API and the worker. Both start with `node --import ./apps/server/dist/src/instrument.js`, which does nothing without a DSN. Server errors and jobs that fail for good are reported with the route or task name and the stack trace. Sentry v11 collects request bodies, user info and database query values by default, so `instrument.ts` turns each of those off ([Sentry: v11 migration](https://docs.sentry.io/platforms/javascript/guides/fastify/migration/v10-to-v11/)). Optional settings are `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE` and `SENTRY_TRACES_SAMPLE_RATE` (default 0). For the app, set `EXPO_PUBLIC_SENTRY_DSN` with `eas env:set`, then update the store privacy answers (`docs/store/APP_PRIVACY_ANSWERS.md`). To get readable stack traces, add the `@sentry/react-native/expo` plugin and a `SENTRY_AUTH_TOKEN` EAS secret ([Expo: Using Sentry](https://docs.expo.dev/guides/using-sentry/)).
- **Metrics (optional):** set `METRICS_TOKEN` (24 characters or more), then scrape `GET /metrics` with `Authorization: Bearer <token>` from Prometheus or Grafana Agent. It reports request counts and latency by route pattern, the background jobs waiting, database connections waiting, and Node memory and CPU. Have Caddy block `/metrics` from the internet, or scrape it on the private network.
- **Pilot metrics:** `GET /admin/metrics?days=7` (admin only): requests, Praying Now taps, commitments made vs kept, moderation volume, tokens and radio prayers.
- **Ledger health:** `select * from token_ledger_audit;` must return no rows.

## 5. The app

Point `apps/mobile/.env` at the production API and Supabase project (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Run `npx eas init` once for push notifications, then build with EAS or Xcode. Store account: Apple Developer Program (the pilot is iPhone only).

## Public website

The API also serves the public pages the app stores ask for: `/` (landing), `/support`, `/privacy`, `/terms` and `/account-deletion`. Use these URLs in App Store Connect. The privacy and terms pages come from `docs/legal/`, which is copied into the Docker image. Until reviewed `PRIVACY_POLICY.md` and `TERMS_OF_USE.md` files are added, the drafts are shown with their warning. Set `SUPPORT_EMAIL` for the contact address, `CRISIS_COUNTRY` for the crisis line, and `APP_STORE_URL` once the app is listed.

The app is English only. The Spanish `/es` pages stay switched off (`SPANISH_ENABLED` unset) until Steve asks for Spanish.
