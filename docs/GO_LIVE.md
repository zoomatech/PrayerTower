# Go live (Fly.io or Render, with Supabase Cloud)

> Written 2026-10-28 from the vendor docs linked in each step. Prices and plan names change; check the links before paying.

Prayer Tower in production is three pieces:

| Piece | Where | Config |
| --- | --- | --- |
| Database, sign-in, photo storage | Supabase Cloud | `supabase/migrations`, pushed by the script |
| API + worker (one Docker image, two processes) | **Fly.io** (default) or Render | `fly.toml` / `render.yaml` |
| Web app testers open in a browser (installable PWA) | Fly.io (`deploy/fly-web`) or a Render static site | built from `apps/mobile` |

The phone apps (TestFlight, Play) point at the same API; see TESTFLIGHT_EAS_GUIDE.md and ANDROID_PLAY_GUIDE.md.

## One command (Fly.io)

```bash
cp deploy/production.env.example deploy/production.env   # fill it in (gitignored)
fly auth login
scripts/go-live.sh --check     # settings and tools only
scripts/go-live.sh             # migrate Supabase, deploy API + worker + web app
```

What the script does, in order:

1. **Checks** every required value is set and none still points at localhost.
2. **Supabase:** `supabase link --project-ref …` then `supabase db push --linked --dry-run`, asks before applying, then `supabase db push --linked`. Set `YES=1` to skip the question. ([CLI: db push](https://supabase.com/docs/reference/cli/supabase-db-push)) It never runs the demo seed.
3. **API + worker:** creates the Fly app if needed (`fly apps create`), loads the server settings with `fly secrets import --stage` (values come from stdin as `NAME=VALUE`), then `fly deploy --ha=false` and `fly scale count app=1 worker=1`. ([fly apps create](https://docs.fly.io/flyctl/cmd/fly_apps_create), [fly secrets import](https://docs.fly.io/flyctl/cmd/fly_secrets_import), [fly deploy](https://docs.fly.io/flyctl/cmd/fly_deploy)) `--ha=false` keeps one machine per process for the pilot; `fly deploy` otherwise creates spares.
4. **Web app:** builds `apps/mobile` for the web with the production addresses, copies it into `deploy/fly-web/site`, and deploys it as a second Fly app served by Caddy.
5. **Smoke test:** waits for `GET /health` to answer `{"ok":true}` and for the web app's manifest.

`scripts/go-live.sh --migrate-only` runs only step 2 (for example before a Render deploy).

### How `fly.toml` is set up

- One app, two **process groups** from the same image: `app` (the API) and `worker` (jobs). Only `app` gets the public `[http_service]`. ([Fly config: processes, http_service](https://docs.fly.io/reference/configuration))
- `auto_stop_machines = "off"` and `min_machines_running = 1` for the API, so push and the station worker always reach it. The web app's `fly.toml` uses `"stop"` with `min_machines_running = 0`, so Fly stops it when idle and starts it on the next visit.
- Health check: `GET /health` every 30 s.
- `[[vm]] size = "shared-cpu-1x"`, `memory = "512mb"`. The load test (LOAD_TEST.md) ran 100 members at under 20 ms p95 on far less than this.
- Region `iad` (US East). Change `primary_region` in both `fly.toml` files to move it nearer the pilot.

## Supabase Cloud

1. Create a project (Pro is recommended for daily backups; see DEPLOY.md).
2. From the project's **Connect** panel, copy the **Session pooler** string (port 5432) into `DATABASE_URL`. Supabase recommends the session pooler for long-running servers on IPv4. Direct connections are IPv6-only unless you buy the IPv4 add-on, and the transaction pooler (6543) is meant for serverless functions. ([Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)) Keep `DATABASE_POOL_MAX` small (5); the API and worker each open a pool.
3. Copy the project URL, the publishable key and the secret key into the env file.
4. **Auth → URL Configuration:** set the Site URL to the web app's address and add it to the Redirect URLs, so sign-up email links open the app instead of localhost. ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)) Set a production SMTP sender in Auth too.

## Render instead of Fly.io

`render.yaml` is a Render Blueprint for the same three pieces: a Docker **web service** (API, health check `/health`), a Docker **background worker** (same image, `dockerCommand` runs the worker) and a **static site** for the web app with a rewrite of every path to `/index.html`. ([Blueprint spec](https://render.com/docs/blueprint-spec))

1. Push the migrations first: `scripts/go-live.sh --migrate-only`.
2. Open https://render.com/deploy?repo=https://github.com/zoomatech/PrayerTower/tree/main . This is Render's Deploy button URL; `/tree/main` picks the branch, because this repo's default branch is not `main` yet. ([Deploy to Render button](https://render.com/docs/deploy-to-render))
3. Render asks for every value marked `sync: false` (the secrets) when it first creates the Blueprint. Use the same values as `deploy/production.env`.
4. The API and the worker use the `0.5c-512mb` plan. Change `plan:` in `render.yaml` to resize them.
5. Put the static site's address in `CORS_ORIGINS` on the API and in Supabase's Site URL.

## Web app for testers (PWA)

Testers who can't use TestFlight open the web app's address in a browser. It is the same app as on phones, built for the web with a [web app manifest and a Workbox service worker](https://docs.expo.dev/guides/progressive-web-apps/):

- **Install it:** Chrome or Edge on Android or a computer shows "Install app" in the address bar or menu. On iPhone, open it in Safari, tap Share, then "Add to Home Screen". It then opens full screen with the Prayer Tower icon.
- **Offline:** the app itself (code, fonts, icons) is saved on the device, so it opens without a connection. The last feed and the offline queue for "Praying now" and text posts work as they do on phones (`src/lib/offline.ts`). API calls are never cached by the service worker.
- **Updates:** a new deploy takes over on the next visit (`skipWaiting`, and `sw.js` and `index.html` are served with `no-cache`).
- **Push notifications** stay phone-only for now; the web app shows them in the in-app list.
- Local development never registers the service worker (it is skipped on localhost).

## After go-live

- Point the phone builds at the API: set `EXPO_PUBLIC_API_URL` in the EAS `production` environment and rebuild.
- Custom domain: `fly certs add api.yourdomain.org -a prayertower-api` (and the web app), then update `CORS_ORIGINS`, `EXPO_PUBLIC_API_URL` and the Supabase Site URL. ([Fly custom domains](https://docs.fly.io/networking/custom-domain))
- Logs: `fly logs -a prayertower-api`. Errors go to Sentry when `SENTRY_DSN` is set.
- Backups: Supabase Pro takes daily backups. Still run `scripts/backup-db.sh` monthly, and run `scripts/restore-drill.sh` before the pilot starts (BACKUP_RESTORE.md).
- New code: `fly deploy --ha=false` for the API and worker. For the web app, re-run `scripts/go-live.sh` (it skips migrations already applied) or just steps 4 and 5.

## Open questions (defaults chosen)

- **Host:** Fly.io is the default, as requested. Render needs no CLI; use it if you'd rather deploy from the browser.
- **Region:** US East (`iad` / `virginia`). Change it if most testers are elsewhere.
- **Web app address:** `prayertower-web.fly.dev` until a domain is chosen.
