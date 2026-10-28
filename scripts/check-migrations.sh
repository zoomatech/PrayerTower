#!/usr/bin/env bash
# Fails when two migrations share a version number (the digits before the first
# underscore). Supabase orders and records migrations by that number, so a
# duplicate means one of them may never run. CI runs this in the lint job.
set -euo pipefail
dir="$(dirname "$0")/../supabase/migrations"
dupes=$(ls "$dir" | grep -E '^[0-9]+_.*\.sql$' | cut -d_ -f1 | sort | uniq -d)
if [ -n "$dupes" ]; then
  echo "Duplicate migration versions (rename one file in each pair to a free number):"
  for v in $dupes; do ls "$dir" | grep "^${v}_" | sed 's/^/  /'; done
  exit 1
fi
echo "Migration versions are unique."
