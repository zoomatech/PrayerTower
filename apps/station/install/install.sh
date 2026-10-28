#!/usr/bin/env bash
# Installs (or updates) the Prayer Tower radio station worker on a Raspberry Pi
# or Debian/Ubuntu laptop: Node.js 22, the worker in /opt/prayer-tower-station,
# a systemd service, a health-check timer and a journal size limit.
# Step-by-step guide: docs/RADIO_STATION_INSTALL.md
#
# Usage, from a clone of the repository:
#   sudo apps/station/install/install.sh             # install or update
#   sudo apps/station/install/install.sh --fldigi    # also install fldigi from apt
#   sudo apps/station/install/install.sh --uninstall # remove (keeps the settings file)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
app=/opt/prayer-tower-station
env_file=/etc/prayer-tower-station.env
user=prayer-station
units=(prayer-tower-station.service prayer-tower-station-health.service prayer-tower-station-health.timer)

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run with sudo"
command -v systemctl >/dev/null || die "this needs systemd (Raspberry Pi OS, Debian or Ubuntu)"

if [ "${1:-}" = "--uninstall" ]; then
  log "Removing the station service"
  systemctl disable --now "${units[@]}" 2>/dev/null || true
  for u in "${units[@]}"; do rm -f "/etc/systemd/system/$u"; done
  rm -f /etc/systemd/journald.conf.d/prayer-station.conf
  systemctl daemon-reload
  rm -rf "$app"
  echo "Removed. $env_file and the $user user were kept; delete them by hand if you want."
  exit 0
fi

with_fldigi=0
[ "${1:-}" = "--fldigi" ] && with_fldigi=1

log "Installing packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates
if [ "$with_fldigi" = 1 ]; then
  apt-get install -y -qq fldigi
fi

# Node.js 22 from NodeSource (https://github.com/nodesource/distributions);
# the Debian packages are older than the worker needs.
node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -lt 22 ]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  rm -f /tmp/nodesource_setup.sh
  apt-get install -y -qq nodejs
fi
node -v

log "Building the worker"
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
# Build in a scratch copy so the clone is left as it was.
mkdir -p "$build/apps"
cp "$repo/package.json" "$repo/package-lock.json" "$build/"
cp -r "$repo/apps/station" "$build/apps/station"
rm -rf "$build/apps/station/node_modules" "$build/apps/station/dist"
(cd "$build" && npm ci --workspace @prayer-tower/station --include-workspace-root=false --no-audit --no-fund --loglevel=error \
  && npm run build --workspace @prayer-tower/station --silent)

log "Installing to $app"
id "$user" >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$user"
rm -rf "$app.new"
mkdir -p "$app.new"
cp -r "$build/apps/station/dist" "$build/apps/station/package.json" "$app.new/"
rm -rf "$app.old"
[ -d "$app" ] && mv "$app" "$app.old"
mv "$app.new" "$app"
rm -rf "$app.old"
chown -R root:root "$app"

if [ ! -f "$env_file" ]; then
  install -m 0640 -o root -g "$user" "$here/station.env.example" "$env_file"
  fresh_env=1
else
  chgrp "$user" "$env_file" && chmod 0640 "$env_file"
  fresh_env=0
fi

log "Installing the systemd service, health check and journal limit"
for u in "${units[@]}"; do install -m 0644 "$here/$u" "/etc/systemd/system/$u"; done
install -d /etc/systemd/journald.conf.d
install -m 0644 "$here/journald-prayer-station.conf" /etc/systemd/journald.conf.d/prayer-station.conf
systemctl daemon-reload
systemctl restart systemd-journald
systemctl enable prayer-tower-station.service prayer-tower-station-health.timer
systemctl start prayer-tower-station-health.timer

if [ "$fresh_env" = 1 ] || grep -q '^STATION_API_KEY=$' "$env_file"; then
  cat <<MSG

Installed. Before starting the worker, fill in $env_file:
  sudo nano $env_file          # API URL, STATION_API_KEY, CALL_SIGN
  sudo systemctl start prayer-tower-station
MSG
else
  systemctl restart prayer-tower-station
  log "Updated and restarted"
fi
cat <<MSG

Check it:
  systemctl status prayer-tower-station
  journalctl -u prayer-tower-station -f
  sudo -u $user node $app/dist/src/health.js
MSG
