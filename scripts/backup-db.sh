#!/usr/bin/env sh
# Off-site backup for databases without managed backups (Supabase Free or
# self-hosted). Writes roles, schema and data dumps into a dated folder.
# Commands follow https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
# Usage: DATABASE_URL=postgresql://... scripts/backup-db.sh [out-dir]
# Backups older than KEEP_DAYS (default 30, the privacy policy's promise) are
# deleted afterwards, because they still hold deleted members' data.
set -eu
: "${DATABASE_URL:?set DATABASE_URL (percent-encoded)}"
dir="${1:-backups}"
keep="${KEEP_DAYS:-30}"
out="$dir/$(date -u +%Y-%m-%dT%H%M%SZ)"
mkdir -p "$out"
npx supabase db dump --db-url "$DATABASE_URL" --role-only -f "$out/roles.sql"
npx supabase db dump --db-url "$DATABASE_URL" -f "$out/schema.sql"
npx supabase db dump --db-url "$DATABASE_URL" --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f "$out/data.sql"
echo "Backup written to $out"
# Only dated folders this script made (2026-10-28T120000Z), never anything else in the folder.
find "$dir" -mindepth 1 -maxdepth 1 -type d -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9]*Z' -mtime +"$keep" -print -exec rm -rf {} +
