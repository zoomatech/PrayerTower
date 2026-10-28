# Go live (Fly.io or Render, with Supabase Cloud)

> Written 2026-10-28 from the vendor docs linked in each step. Prices and plan names change; check the links before paying.

Prayer Tower in production is three pieces:

| Piece | Where | Config |
| --- | --- | --- |
| Database, sign-in, photo storage | Supabase Cloud | `supabase/migrations`, pushed by the script |
| API + worker (one Docker image, two processes) | **Fly.io** (default) or Render | `fly.toml` / `render.yaml` |
| Web app testers open in a browser (installable PWA) | Fly.io (`deploy/fly-web`) or a Render static site | built from `apps/mobile` |

The iPhone app (TestFlight) points at the same API; see TESTFLIGHT_EAS_GUIDE.md and RELEASING_APPS.md. The pilot is iPhone only.

## One command (Fly.io)

```bash
cp deploy/production.env.example deploy/production.env   # fill it in (gitignored)
fly auth login
scripts/go-live.sh --check     # settings and tools only
scripts/go-live.sh             # migrate Supabase, deploy API + worker + web app
```

What the script does, in order:

1. **Checks** every required value is set and none still points at localhost. The env file is read as plain `NAME=value` lines, so values with spaces or `<>` (such as `MAIL_FROM=Prayer Tower <hello@yourdomain.org>`) need no quotes.
2. **Supabase:** `supabase link --project-ref …` then `supabase db push --linked --dry-run`, asks before applying, then `supabase db push --linked`. Set `YES=1` to skip the question. ([CLI: db push](https://supabase.com/docs/reference/cli/supabase-db-push)) It never runs the demo seed.
3. **API + worker:** creates the Fly app if needed (`fly apps create`), loads the server settings with `fly secrets import --stage` (values come from stdin as `NAME=VALUE`), then `fly deploy --ha=false` and `fly scale count app=1 worker=1`. ([fly apps create](https://docs.fly.io/flyctl/cmd/fly_apps_create), [fly secrets import](https://docs.fly.io/flyctl/cmd/fly_secrets_import), [fly deploy](https://docs.fly.io/flyctl/cmd/fly_deploy)) `--ha=false` keeps one machine per process for the pilot; `fly deploy` otherwise creates spares.
4. **Web app:** builds `apps/mobile` for the web with the production addresses, copies it into `deploy/fly-web/site`, and deploys it as a second Fly app served by Caddy.
5. **Smoke test:** waits for `GET /health` to answer `{"ok":true}` and for the web app's manifest. If either doesn't answer within about a minute, the script stops with an error instead of printing "Live".

`scripts/go-live.sh --migrate-only` runs only step 2 (for example before a Render deploy).

### How `fly.toml` is set up

- One app, two **process groups** from the same image: `app` (the API) and `worker` (jobs). Only `app` gets the public `[http_service]`. ([Fly config: processes, http_service](https://docs.fly.io/reference/configuration))
- `auto_stop_machines = "off"` and `min_machines_running = 1` for the API, so push and the station worker always reach it. The web app's `fly.toml` uses `"stop"` with `min_machines_running = 0`, so Fly stops it when idle and starts it on the next visit.
- Health check: `GET /health` every 30 s.
- `[[vm]] size = "shared-cpu-1x"`, `memory = "512mb"`. That is plenty for the 10-member pilot.
- Region `iad` (US East). Change `primary_region` in both `fly.toml` files to move it nearer the pilot.

## Supabase Cloud

1. Create a project (Pro is recommended for daily backups; see DEPLOY.md).
2. From the project's **Connect** panel, copy the **Session pooler** string (port 5432) into `DATABASE_URL`. Supabase recommends the session pooler for long-running servers on IPv4. Direct connections are IPv6-only unless you buy the IPv4 add-on, and the transaction pooler (6543) is meant for serverless functions. ([Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres)) Keep `DATABASE_POOL_MAX` small (5); the API and worker each open a pool.
3. Copy the project URL, the publishable key and the secret key into the env file.
4. **Auth → URL Configuration:** set the Site URL to the web app's address and add it to the Redirect URLs, so sign-up email links open the app instead of localhost. ([Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)) Set a production SMTP sender in Auth too. With `SUPABASE_ACCESS_TOKEN` in `deploy/production.env`, `scripts/go-live.sh` does this step for you from `WEB_APP_URL` and `SMTP_URL`, and also sets 8-character passwords and email confirmations ([Management API: auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config)).
5. **Invite-code hook:** with `SUPABASE_ACCESS_TOKEN` in the env file, `go-live.sh` turns on Auth's Before User Created hook (`public.hook_before_user_created`) itself, through the Management API, and then checks it saved. ([Update auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config)) Without the token, it prints an ACTION NEEDED line and carries on. In that case go to Dashboard → Authentication → Hooks and turn the hook on by hand (INVITES.md). Until the hook is on, anyone can sign up without a code.

## Your first sign-in (the first admin)

Sign-up is invite-only, and on a new database there are no invite codes and no admin to make one. Put your own email in `ADMIN_EMAILS` before running the script. That address can then sign up without a code, and the server makes it admin as soon as it starts and every 5 minutes after. Other addresses still need a code. Remove an address from `ADMIN_EMAILS` and it needs a code again; an admin it already made stays admin.

Then make at least one more person a moderator (Admin → Roles). A moderator can't decide reports about their own posts, so with only one staff member, reports on that person's posts wait.

## Rehearsal (2026-10-28)

The whole page was followed on a fresh local stack standing in for Supabase Cloud and Fly.io, as Steve would run it. These steps failed and are fixed:

| Step | What went wrong | Fix |
|---|---|---|
| 1. Checks | A `MAIL_FROM` with spaces and `<>` broke the script | The env file is read as text, not run as shell |
| 3. API | The built server stopped at start: it looked for `package.json` in the wrong folder | It looks in both places and falls back to "unknown" |
| 5. Smoke test | It printed "Live" even when the web app didn't answer | It retries for a minute, then stops with an error |
| First sign-in | Nobody could sign up: no codes, no admin to make one | `ADMIN_EMAILS` addresses can sign up without a code (above) |
| Emails | The sign-up and password email subjects were half Spanish | English only, like the rest of the app |

Radio, in both modes: a prayer queued, sent, counted on Prayer Cast and the poster told; a removed request was not sent and the Priestly token came back; in station mode the station program sent through fldigi (a stand-in), and when the radio didn't key it reported the failure and stopped. Two problems were fixed: members could spend a Priestly token in station mode on a prayer the station would never send (now refused with a plain message), and a sender wasn't told when a radio prayer didn't go out (now they are, and told when the token is back).

Docker builds can't run in the rehearsal sandbox, so the image itself wasn't built there; the same `node` commands from `fly.toml` ran the built server and worker.

## Render instead of Fly.io

`render.yaml` is a Render Blueprint for the same three pieces: a Docker **web service** (API, health check `/health`), a Docker **background worker** (same image, `dockerCommand` runs the worker) and a **static site** for the web app with a rewrite of every path to `/index.html`. ([Blueprint spec](https://render.com/docs/blueprint-spec))

1. Push the migrations first: `scripts/go-live.sh --migrate-only`.
2. Open https://render.com/deploy?repo=https://github.com/zoomatech/PrayerTower/tree/main . This is Render's Deploy button URL; `/tree/main` picks the `main` branch, which is the default branch. ([Deploy to Render button](https://render.com/docs/deploy-to-render))
3. Render asks for every value marked `sync: false` (the secrets) when it first creates the Blueprint. Use the same values as `deploy/production.env`.
4. The API and the worker use the `0.5c-512mb` plan. Change `plan:` in `render.yaml` to resize them.
5. Put the static site's address in `CORS_ORIGINS` on the API and in Supabase's Site URL.

## Web app for testers (PWA)

Testers who can't use TestFlight open the web app's address in a browser. It is the same app as on phones, built for the web with a [web app manifest and a Workbox service worker](https://docs.expo.dev/guides/progressive-web-apps/):

- **Install it:** Chrome or Edge on a computer shows "Install app" in the address bar or menu. On iPhone, open it in Safari, tap Share, then "Add to Home Screen". It then opens full screen with the Prayer Tower icon.
- **Offline:** the app itself (code, fonts, icons) is saved on the device, so it opens without a connection. The last feed and the offline queue for "Praying now" and text posts work as they do on phones (`src/lib/offline.ts`). API calls are never cached by the service worker.
- **Updates:** a new deploy takes over on the next visit (`skipWaiting`, and `sw.js` and `index.html` are served with `no-cache`).
- **Push notifications** stay phone-only for now; the web app shows them in the in-app list.
- Local development never registers the service worker (it is skipped on localhost).

## After go-live

- Point the iPhone build at the API: set `EXPO_PUBLIC_API_URL` in the EAS `production` environment and rebuild (RELEASING_APPS.md).
- Custom domain: `fly certs add api.yourdomain.org -a prayertower-api` (and the web app), then update `CORS_ORIGINS`, `EXPO_PUBLIC_API_URL` and the Supabase Site URL. ([Fly custom domains](https://docs.fly.io/networking/custom-domain))
- Logs: `fly logs -a prayertower-api`. Errors go to Sentry when `SENTRY_DSN` is set.
- Backups: Supabase Pro takes daily backups. Still run `scripts/backup-db.sh` monthly, and run `scripts/restore-drill.sh` before the pilot starts (BACKUP_RESTORE.md).
- New code: `fly deploy --ha=false` for the API and worker. For the web app, re-run `scripts/go-live.sh` (it skips migrations already applied) or just steps 4 and 5.

## Open questions (defaults chosen)

- **Host:** Fly.io is the default, as requested. Render needs no CLI; use it if you'd rather deploy from the browser.
- **Region:** US East (`iad` / `virginia`). Change it if most testers are elsewhere.
- **Web app address:** `prayertower-web.fly.dev` until a domain is chosen.
