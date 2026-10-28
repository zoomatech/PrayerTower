#!/usr/bin/env bash
# Backup and restore drill. Takes a backup with scripts/backup-db.sh, restores
# it into an empty database, and checks that every table came back with the
# same number of rows and that the token ledger still balances.
#
# Usage:
#   scripts/restore-drill.sh                 # local stack -> throwaway local stack
#   DATABASE_URL=... scripts/restore-drill.sh            # any source -> throwaway local stack
#   DATABASE_URL=... RESTORE_URL=... scripts/restore-drill.sh  # restore into a NEW, empty project
#
# RESTORE_URL must be a brand-new Supabase project (for example a staging
# project made for the drill). The script refuses a target that already has
# Prayer Tower tables, so it can never overwrite a real database.
# DRILL_STRICT=0 reports row-count differences without failing, for a live
# source that takes writes while the dump runs.
# Needs Docker, psql and the repo's Supabase CLI (npx supabase).
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
source_url=${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}
strict=${DRILL_STRICT:-1}
work=$(mktemp -d)
drill_stack=""

cleanup() {
  if [ -n "$drill_stack" ]; then
    npx supabase stop --workdir "$drill_stack" --no-backup >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log() { printf '%s  %s\n' "$(date -u +%H:%M:%S)" "$*"; }

# 1. Backup.
start=$(date +%s)
log "Backing up the source database"
DATABASE_URL="$source_url" "$root/scripts/backup-db.sh" "$work/backups" >/dev/null
dump=$(ls -d "$work"/backups/*/ | head -1)
backup_secs=$(($(date +%s) - start))
log "Backup done in ${backup_secs}s ($(du -sh "$dump" | cut -f1))"

# 2. Target: a new project, or a throwaway local Supabase stack on 553xx ports.
if [ -z "${RESTORE_URL:-}" ]; then
  log "Starting a throwaway Supabase stack for the restore"
  drill_stack="$work/stack"
  mkdir -p "$drill_stack/supabase/migrations"
  sed -e 's/^project_id = .*/project_id = "prayertower-drill"/' \
      -e 's/543\([0-9][0-9]\)/553\1/g' \
      -e 's/^inspector_port = 8083/inspector_port = 8093/' \
      "$root/supabase/config.toml" > "$drill_stack/supabase/config.toml"
  npx supabase start --workdir "$drill_stack" -x studio,imgproxy,logflare,vector,supavisor,edge-runtime,realtime >/dev/null
  RESTORE_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres
fi

if [ "$(psql "$RESTORE_URL" -tAc "select to_regclass('public.profiles') is not null")" = "t" ]; then
  echo "The restore target already has Prayer Tower tables. Use a new, empty project." >&2
  exit 1
fi

# 3. Restore, as in Supabase's backup and restore guide. Grants on server
# parameters belong to Supabase's own roles, which a new project already has,
# and only a superuser may give them, so they are left out.
grep -v '^GRANT SET ON PARAMETER' "$dump/roles.sql" > "$work/roles.sql"
start=$(date +%s)
log "Restoring"
psql --quiet --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$work/roles.sql" \
  --file "$dump/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$dump/data.sql" \
  --dbname "$RESTORE_URL" >/dev/null
restore_secs=$(($(date +%s) - start))
log "Restore done in ${restore_secs}s"

# 4. Verify row counts table by table.
count_sql="select format('select %L, count(*) from %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','graphile_worker')
    and not c.relispartition
  order by 1"
counts() {
  psql "$1" -tAc "$count_sql" | while IFS= read -r q; do psql "$1" -tA -F' ' -c "$q"; done
}
counts "$source_url" > "$work/source.txt"
counts "$RESTORE_URL" > "$work/restored.txt"
tables=$(wc -l < "$work/source.txt")
if diff "$work/source.txt" "$work/restored.txt" > "$work/diff.txt"; then
  log "All $tables tables have matching row counts"
  counts_ok=1
else
  log "Row counts differ:"
  cat "$work/diff.txt"
  counts_ok=0
fi

ledger=$(psql "$RESTORE_URL" -tAc "select count(*) from token_ledger_audit")
log "Token ledger audit rows on the restored copy: $ledger (must be 0)"

echo
echo "Backup ${backup_secs}s, restore ${restore_secs}s, $tables tables, counts $([ $counts_ok = 1 ] && echo match || echo differ), ledger $([ "$ledger" = 0 ] && echo balanced || echo 'NOT balanced')"
if [ "$ledger" != 0 ] || { [ $counts_ok = 0 ] && [ "$strict" = 1 ]; }; then
  exit 1
fi
