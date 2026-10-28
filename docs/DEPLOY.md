# Deploying the pilot

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
# PUSH_ENABLED=1, EXPO_ACCESS_TOKEN (optional), OPENAI_API_KEY (optional).
docker compose up -d --build
curl -s localhost:3000/health   # {"ok":true}
```

HTTPS: install Caddy, copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, set your domain, and reload Caddy. It gets and renews the certificate automatically once DNS points at the server and ports 80 and 443 are open. ([Caddy reverse proxy quick start](https://caddyserver.com/docs/quick-starts/reverse-proxy))

The API runs migrations for the job queue on start. Scale the worker with `docker compose up -d --scale worker=2`.

## 3. Backups

- Supabase Pro: automatic (above). Still take a monthly off-site dump with `scripts/backup-db.sh`.
- Free or self-hosted: run `scripts/backup-db.sh` daily from cron and copy the folder off the server.
- Test a restore before the pilot starts.

## 4. Monitoring

- **Uptime:** point an uptime checker at `https://<api-domain>/health` (returns `{"ok":true}`).
- **Errors:** `docker compose logs -f api worker` shows request errors and failed jobs; Graphile Worker retries failed jobs with backoff.
- **Pilot metrics:** `GET /admin/metrics?days=7` (admin only): requests, Praying Now taps, commitments made vs kept, moderation volume, tokens and radio prayers.
- **Ledger health:** `select * from token_ledger_audit;` must return no rows.

## 5. The app

Point `apps/mobile/.env` at the production API and Supabase project (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Run `npx eas init` once for push notifications, then build with EAS or Xcode. Store accounts: Apple Developer Program and Google Play Console.
