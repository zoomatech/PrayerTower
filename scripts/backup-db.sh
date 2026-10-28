#!/usr/bin/env sh
# Off-site backup for databases without managed backups (Supabase Free or
# self-hosted). Writes roles, schema and data dumps into a dated folder.
# Commands follow https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
# Usage: DATABASE_URL=postgresql://... scripts/backup-db.sh [out-dir]
set -eu
: "${DATABASE_URL:?set DATABASE_URL (percent-encoded)}"
out="${1:-backups}/$(date -u +%Y-%m-%dT%H%M%SZ)"
mkdir -p "$out"
npx supabase db dump --db-url "$DATABASE_URL" --role-only -f "$out/roles.sql"
npx supabase db dump --db-url "$DATABASE_URL" -f "$out/schema.sql"
npx supabase db dump --db-url "$DATABASE_URL" --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f "$out/data.sql"
echo "Backup written to $out"
