#!/usr/bin/env bash
# Start the local Supabase stack in CI and wait until Postgres answers.
#
# Runners sometimes report "failed to bind host port 0.0.0.0:54322: address
# already in use" (2026-10-28, and three tries in a row on 2026-10-29). Each try
# first frees the ports (stale containers, any other process holding them). If the
# default ports still can't be used after two tries, the stack moves to 55xxx
# ports, and DATABASE_URL, SUPABASE_URL and E2E_MAIL_URL are written to
# $GITHUB_ENV so the later steps follow it.
set -uo pipefail
cd "$(dirname "$0")/.."

free_ports() {
  docker ps -aq --filter name=supabase_ | xargs -r docker rm -f >/dev/null 2>&1 || true
  for p in $(grep -E '^\s*(shadow_)?port = [0-9]+' supabase/config.toml | grep -oE '[0-9]+$'); do
    if command -v fuser >/dev/null; then sudo -n fuser -k "$p/tcp" >/dev/null 2>&1 || true; fi
  done
}

show_ports() {
  echo "Ports in use:"
  (sudo -n ss -ltnp 2>/dev/null || ss -ltnp 2>/dev/null || true) | grep -E ':5[45]3[0-9]{2}' || echo "  (none listed)"
  docker ps -a --format '  {{.Names}} {{.Status}} {{.Ports}}' 2>/dev/null || true
}

# Wait until Postgres accepts queries (the CLI can return before it is ready for clients).
wait_for_db() {
  local url=$1
  for _ in $(seq 1 60); do
    if docker exec supabase_db_prayertower pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 &&
       node -e "const c=new (require('pg').Client)({connectionString:process.argv[1]});c.connect().then(()=>c.query('select 1')).then(()=>process.exit(0),()=>process.exit(1))" "$url"; then
      return 0
    fi
    sleep 2
  done
  return 1
}

db_port() { grep -A3 '^\[db\]' supabase/config.toml | grep -oE '^port = [0-9]+' | grep -oE '[0-9]+'; }

for attempt in 1 2 3 4; do
  if [ "$attempt" = 3 ]; then
    echo "Moving the local stack from 543xx to 553xx ports."
    sed -i -E 's/^(\s*(shadow_)?port = )543([0-9]{2})$/\1553\3/' supabase/config.toml
    port=$(db_port)
    if [ -n "${GITHUB_ENV:-}" ]; then
      {
        echo "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${port}/postgres"
        echo "SUPABASE_URL=http://127.0.0.1:55321"
        echo "E2E_MAIL_URL=http://127.0.0.1:55324"
      } >> "$GITHUB_ENV"
    fi
  fi
  free_ports
  if npm run db:start; then
    port=$(db_port)
    if wait_for_db "postgresql://postgres:postgres@127.0.0.1:${port}/postgres"; then
      echo "Supabase is up on port ${port} (attempt $attempt)."
      exit 0
    fi
    echo "Supabase started but Postgres did not answer within 2 minutes (attempt $attempt)."
  else
    echo "Supabase did not start (attempt $attempt)."
  fi
  show_ports
  npx supabase stop --no-backup || true
  sleep $((attempt * 10))
done
echo "Supabase did not start after 4 attempts." >&2
exit 1
