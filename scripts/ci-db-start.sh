#!/usr/bin/env bash
# Start the local Supabase stack in CI, retrying when Docker can't bind a port.
# Runners sometimes report "failed to bind host port 0.0.0.0:54322: address
# already in use" on the first try (seen twice on 2026-10-28); a clean stop and
# a short wait clears it.
set -uo pipefail
for attempt in 1 2 3; do
  npm run db:start && exit 0
  echo "Supabase did not start (attempt $attempt). Ports in use:"
  (ss -ltnp 2>/dev/null || true) | grep -E ':543[0-9]{2}' || true
  npx supabase stop --no-backup || true
  sleep $((attempt * 10))
done
echo "Supabase did not start after 3 attempts." >&2
exit 1
