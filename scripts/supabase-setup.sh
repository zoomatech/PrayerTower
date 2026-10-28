#!/usr/bin/env bash
# Set up Supabase Cloud for Prayer Tower in one go, from a personal access token:
# create the project (Free plan unless the organization is paid), fill in
# deploy/production.env, push every migration, and set up sign-in (invite-code
# hook, 8-character passwords, confirmed emails, the email templates) through
# scripts/go-live.sh --migrate-only. Never runs the demo seed.
#
#   scripts/supabase-setup.sh           # token from SUPABASE_ACCESS_TOKEN, the env file, or the Mac clipboard
#   PROJECT_NAME=prayer-tower REGION=americas scripts/supabase-setup.sh
#
# Steve's part is only signing up and copying a token (docs/GO_LIVE.md → Supabase Cloud).
# Re-running is safe: an existing project with the same name is reused.
# APIs: https://supabase.com/docs/guides/integrations/supabase-for-platforms
#       https://supabase.com/docs/reference/api/v1-get-pooler-config
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
env_file=${ENV_FILE:-$root/deploy/production.env}
name=${PROJECT_NAME:-prayer-tower}
region=${REGION:-americas}
api=https://api.supabase.com/v1
log() { printf '\n==> %s\n' "$*"; }
die() { printf 'supabase-setup: %s\n' "$*" >&2; exit 1; }
command -v node >/dev/null || die "needs Node 22"
command -v curl >/dev/null || die "needs curl"

[ -f "$env_file" ] || cp "$root/deploy/production.env.example" "$env_file"
# Read one NAME=value from the env file (plain text, like go-live.sh).
get() { sed -n "s/^$1=//p" "$env_file" | tail -1; }
# Write NAME=value into the env file, replacing the line if it is there.
put() {
  NAME="$1" VALUE="$2" node -e '
    const fs = require("fs"), f = process.argv[1], { NAME, VALUE } = process.env;
    const lines = fs.readFileSync(f, "utf8").split("\n");
    const i = lines.findIndex((l) => l.startsWith(NAME + "="));
    if (i >= 0) lines[i] = NAME + "=" + VALUE; else lines.splice(lines.length - 1, 0, NAME + "=" + VALUE);
    fs.writeFileSync(f, lines.join("\n"), { mode: 0o600 });
  ' "$env_file"
}

# 1. The token: environment, env file, or the clipboard on a Mac (Steve clicks Copy on the token page).
token=${SUPABASE_ACCESS_TOKEN:-$(get SUPABASE_ACCESS_TOKEN)}
if [ -z "$token" ] && command -v pbpaste >/dev/null; then
  clip=$(pbpaste | tr -d '[:space:]')
  case "$clip" in sbp_*) token=$clip ;; esac
fi
[ -n "$token" ] || die "no access token: copy one from https://supabase.com/dashboard/account/tokens, then run this again"
put SUPABASE_ACCESS_TOKEN "$token"
call() { # method path [json]
  curl -fsS -X "$1" "$api$2" -H "Authorization: Bearer $token" -H 'content-type: application/json' ${3:+--data "$3"}
}
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval(process.argv[1]))})' "$1"; }
call GET /projects >/dev/null || die "Supabase refused the token (it may be scoped too narrowly; a full-access token works)"
echo "Token works."

# 2. Organization: the account's first one, or a new one on the Free plan.
log "Finding your Supabase organization"
org=$(call GET /organizations | json 'v[0] ? v[0].id : ""')
if [ -z "$org" ]; then
  org=$(call POST /organizations '{"name":"Prayer Tower"}' | json 'v.id')
  echo "Created organization \"Prayer Tower\"."
fi
echo "Organization: $org"

# 3. Project: reuse one with this name, else create it with a strong random database password.
ref=$(call GET /projects | NAME="$name" json 'process.env.NAME && (v.find(p=>p.name===process.env.NAME)||{}).id || ""')
pass=$(get SUPABASE_DB_PASSWORD)
if [ -z "$ref" ]; then
  log "Creating project \"$name\" (region group: $region)"
  [ -n "$pass" ] || pass=$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')
  put SUPABASE_DB_PASSWORD "$pass"
  body=$(ORG="$org" NAME="$name" PASS="$pass" REGION="$region" node -e '
    const e = process.env;
    console.log(JSON.stringify({ name: e.NAME, organization_slug: e.ORG, db_pass: e.PASS, region_selection: { type: "smartGroup", code: e.REGION } }));')
  ref=$(call POST /projects "$body" | json 'v.id || v.ref')
  echo "Created project $ref."
else
  echo "Reusing project $ref."
  [ -n "$pass" ] || die "project $name exists but SUPABASE_DB_PASSWORD is not in $env_file; reset it in Project Settings → Database"
fi
put SUPABASE_PROJECT_REF "$ref"

log "Waiting for the database to start (a few minutes for a new project)"
for i in $(seq 1 60); do
  state=$(call GET "/projects/$ref/health?services=db&services=pooler&services=auth" 2>/dev/null \
    | json 'v.every(s=>s.status==="ACTIVE_HEALTHY") ? "ready" : "starting"' 2>/dev/null || echo starting)
  [ "$state" = ready ] && break
  sleep 10
done
[ "$state" = ready ] || die "project $ref is not healthy after 10 minutes; run this again later"
echo "Project is up."

# 4. Keys and addresses into the env file.
log "Saving the project's address, keys and database string to $env_file"
keys=$(call GET "/projects/$ref/api-keys?reveal=true")
pub=$(printf '%s' "$keys" | json '(v.find(k=>k.type==="publishable")||{}).api_key || ""')
sec=$(printf '%s' "$keys" | json '(v.find(k=>k.type==="secret")||{}).api_key || ""')
[ -n "$pub" ] || pub=$(call POST "/projects/$ref/api-keys" '{"type":"publishable","name":"default"}' | json 'v.api_key')
[ -n "$sec" ] || sec=$(call POST "/projects/$ref/api-keys?reveal=true" '{"type":"secret","name":"default","secret_jwt_template":{"role":"service_role"}}' | json 'v.api_key')
# Session pooler (port 5432) on the pooler host: what a long-running server should use (docs/GO_LIVE.md).
pool=$(call GET "/projects/$ref/config/database/pooler" | json 'JSON.stringify(v.find(p=>p.database_type==="PRIMARY")||v[0])')
db_url=$(POOL="$pool" PASS="$pass" node -e '
  const p = JSON.parse(process.env.POOL);
  console.log(`postgresql://${p.db_user}:${encodeURIComponent(process.env.PASS)}@${p.db_host}:5432/${p.db_name || "postgres"}`);')
put SUPABASE_URL "https://$ref.supabase.co"
put EXPO_PUBLIC_SUPABASE_URL "https://$ref.supabase.co"
put SUPABASE_PUBLISHABLE_KEY "$pub"
put EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$pub"
put SUPABASE_SECRET_KEY "$sec"
put DATABASE_URL "$db_url"
# Placeholders go-live.sh checks; the real addresses come with the Fly deploy (STEVE_TODO.md).
[ -n "$(get EXPO_PUBLIC_API_URL)" ] || put EXPO_PUBLIC_API_URL "https://prayertower-api.fly.dev"
[ -n "$(get CORS_ORIGINS)" ] || put CORS_ORIGINS "https://prayertower-web.fly.dev"
echo "Saved (the file is gitignored and readable only by you)."

# 5. Migrations and sign-in settings.
log "Pushing migrations and setting up sign-in"
YES=1 ENV_FILE="$env_file" "$root/scripts/go-live.sh" --migrate-only

printf '\nSupabase is ready: https://supabase.com/dashboard/project/%s\n' "$ref"
