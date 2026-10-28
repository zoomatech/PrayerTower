#!/usr/bin/env bash
# Go live: push the database migrations to Supabase Cloud, then deploy the API,
# the worker and the web app (PWA). Fly.io is the default; Render deploys from
# render.yaml instead (see docs/GO_LIVE.md).
#
# Usage:
#   cp deploy/production.env.example deploy/production.env   # fill it in
#   scripts/go-live.sh                 # check, migrate, deploy to Fly.io
#   scripts/go-live.sh --check         # only check settings and tools
#   scripts/go-live.sh --migrate-only  # only push migrations to Supabase
#   ENV_FILE=deploy/other.env scripts/go-live.sh
# Needs Node 22 (npx) and flyctl signed in (`fly auth login`); Fly builds the
# images remotely, so Docker is not needed. Never runs the demo seed.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
env_file=${ENV_FILE:-$root/deploy/production.env}
mode=${1:-all}
log() { printf '\n==> %s\n' "$*"; }
die() { printf 'go-live: %s\n' "$*" >&2; exit 1; }

[ -f "$env_file" ] || die "no $env_file (copy deploy/production.env.example)"
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

# 1. Settings and tools.
log "Checking settings in $env_file"
missing=()
for v in SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD DATABASE_URL SUPABASE_URL SUPABASE_SECRET_KEY SUPABASE_PUBLISHABLE_KEY \
         CORS_ORIGINS EXPO_PUBLIC_API_URL EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
[ ${#missing[@]} = 0 ] || die "set these in $env_file: ${missing[*]}"
case "$DATABASE_URL$SUPABASE_URL$EXPO_PUBLIC_API_URL" in
  *'<'*|*127.0.0.1*|*localhost*) die "DATABASE_URL, SUPABASE_URL and EXPO_PUBLIC_API_URL must be the real cloud values" ;;
esac
[ "$SUPABASE_URL" = "$EXPO_PUBLIC_SUPABASE_URL" ] || die "SUPABASE_URL and EXPO_PUBLIC_SUPABASE_URL differ"
FLY_API_APP=${FLY_API_APP:-prayertower-api}
FLY_WEB_APP=${FLY_WEB_APP:-prayertower-web}
FLY_ORG=${FLY_ORG:-personal}
if [ "$mode" != --migrate-only ]; then
  command -v fly >/dev/null || die "install flyctl: https://fly.io/docs/flyctl/install/"
  fly auth whoami >/dev/null 2>&1 || die "sign in first: fly auth login"
fi
echo "Settings look complete."
[ "$mode" = --check ] && exit 0

# 2. Database: link the project and push every migration in supabase/migrations.
# https://supabase.com/docs/reference/cli/supabase-db-push
log "Pushing migrations to Supabase project $SUPABASE_PROJECT_REF"
cd "$root"
npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
npx supabase db push --linked --password "$SUPABASE_DB_PASSWORD" --dry-run
if [ "${YES:-}" != 1 ]; then
  read -r -p "Apply the migrations above to $SUPABASE_PROJECT_REF? [y/N] " ok
  [ "$ok" = y ] || [ "$ok" = Y ] || die "stopped before migrating"
fi
npx supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
[ "$mode" = --migrate-only ] && exit 0

# 3. API and worker on Fly.io (fly.toml). Secrets are every server setting in the
# env file except the Supabase CLI password, the web build values and Fly names.
log "Deploying the API and worker to Fly.io app $FLY_API_APP"
fly status -a "$FLY_API_APP" >/dev/null 2>&1 || fly apps create "$FLY_API_APP" --org "$FLY_ORG"
grep -E '^[A-Z_][A-Z0-9_]*=.+' "$env_file" \
  | grep -vE '^(SUPABASE_PROJECT_REF|SUPABASE_DB_PASSWORD|EXPO_PUBLIC_[A-Z_]*|FLY_[A-Z_]*)=' \
  | fly secrets import --stage -a "$FLY_API_APP"
# --ha=false: one machine per process for the pilot; scale later with `fly scale count`.
fly deploy -a "$FLY_API_APP" --config "$root/fly.toml" --ha=false
fly scale count app=1 worker=1 -a "$FLY_API_APP" --yes

# 4. Web app (PWA), built here with the production API and Supabase addresses.
log "Building the web app"
(cd "$root/apps/mobile" && EXPO_OFFLINE=1 npm run export:web)
rm -rf "$root/deploy/fly-web/site" && cp -R "$root/apps/mobile/dist" "$root/deploy/fly-web/site"
log "Deploying the web app to Fly.io app $FLY_WEB_APP"
fly status -a "$FLY_WEB_APP" >/dev/null 2>&1 || fly apps create "$FLY_WEB_APP" --org "$FLY_ORG"
fly deploy "$root/deploy/fly-web" -a "$FLY_WEB_APP" --config "$root/deploy/fly-web/fly.toml" --ha=false

# 5. Smoke test.
log "Checking the live API"
for i in $(seq 1 20); do
  if curl -fsS "$EXPO_PUBLIC_API_URL/health" | grep -q '"ok":true'; then
    echo "API is up: $EXPO_PUBLIC_API_URL/health"
    break
  fi
  [ "$i" = 20 ] && die "API did not answer at $EXPO_PUBLIC_API_URL/health (fly logs -a $FLY_API_APP)"
  sleep 5
done
curl -fsSI "https://$FLY_WEB_APP.fly.dev/manifest.json" >/dev/null && echo "Web app is up: https://$FLY_WEB_APP.fly.dev"
log "Live. Next: docs/GO_LIVE.md → After go-live"
