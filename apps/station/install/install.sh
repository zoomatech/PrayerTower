#!/usr/bin/env bash
# Installs (or updates) the Prayer Tower radio station worker on a Raspberry Pi
# or Debian/Ubuntu laptop: Node.js 22, the worker in /opt/prayer-tower-station,
# a systemd service, a health-check timer and a journal size limit.
# Step-by-step guide: docs/RADIO_STATION_INSTALL.md
#
# Usage, from a clone of the repository:
#   sudo apps/station/install/install.sh             # install or update
#   sudo apps/station/install/install.sh --fldigi    # also install fldigi from apt
#   sudo apps/station/install/install.sh --hamlib    # also install Hamlib rigctld (rig control)
#   sudo apps/station/install/install.sh --listener  # also install the receive-only listener node
#   sudo apps/station/install/install.sh --listener-only  # a listener node only: the station service stays off
#   sudo apps/station/install/install.sh --listener-only --sdr  # ...listening with an RTL-SDR USB dongle (rtl_fm)
#   sudo apps/station/install/install.sh --uninstall # remove (keeps the settings file)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
app=/opt/prayer-tower-station
env_file=/etc/prayer-tower-station.env
user=prayer-station
units=(prayer-tower-station.service prayer-tower-station-health.service prayer-tower-station-health.timer)
rig_env=/etc/prayer-tower-rigctld.env
listener_env=/etc/prayer-tower-listener.env

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run with sudo"
command -v systemctl >/dev/null || die "this needs systemd (Raspberry Pi OS, Debian or Ubuntu)"

if [ "${1:-}" = "--uninstall" ]; then
  log "Removing the station service"
  systemctl disable --now "${units[@]}" prayer-tower-rigctld.service prayer-tower-listener.service 2>/dev/null || true
  for u in "${units[@]}" prayer-tower-rigctld.service prayer-tower-listener.service; do rm -f "/etc/systemd/system/$u"; done
  rm -rf /etc/systemd/system/prayer-tower-listener.service.d
  rm -f /etc/systemd/journald.conf.d/prayer-station.conf
  systemctl daemon-reload
  rm -rf "$app"
  echo "Removed. $env_file, $rig_env, $listener_env and the $user user were kept; delete them by hand if you want."
  exit 0
fi

with_fldigi=0
with_hamlib=0
with_listener=0
listener_only=0
with_sdr=0
for arg in "$@"; do
  case "$arg" in
    --fldigi) with_fldigi=1 ;;
    --hamlib) with_hamlib=1 ;;
    --listener) with_listener=1 ;;
    --listener-only) with_listener=1; listener_only=1 ;;
    --sdr) with_sdr=1; with_listener=1 ;;
    *) die "unknown option $arg" ;;
  esac
done

log "Installing packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates
if [ "$with_fldigi" = 1 ]; then
  apt-get install -y -qq fldigi
fi
if [ "$with_listener" = 1 ]; then
  # arecord, for recording from the receiver's sound card.
  apt-get install -y -qq alsa-utils
fi
if [ "$with_sdr" = 1 ]; then
  # rtl_fm and rtl_test (https://osmocom.org/projects/rtl-sdr). The package keeps the TV
  # driver off the dongle (librtlsdr-blacklist.conf) and lets the plugdev group open it.
  apt-get install -y -qq rtl-sdr
fi
if [ "$with_hamlib" = 1 ]; then
  # rigctld and rigctl (https://hamlib.github.io/)
  apt-get install -y -qq libhamlib-utils
fi

# Node.js 22 from NodeSource (https://github.com/nodesource/distributions);
# the Debian packages are older than the worker needs.
node_bin=$(command -v node || true)
node_major=$([ -n "$node_bin" ] && "$node_bin" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -lt 22 ]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  rm -f /tmp/nodesource_setup.sh
  apt-get install -y -qq nodejs
  # NodeSource installs to /usr/bin; an older node earlier on PATH (say /usr/local/bin) must not win.
  node_bin=/usr/bin/node
fi
"$node_bin" -v
# Build and run with that Node.js (and its npm).
export PATH="$(dirname "$node_bin"):$PATH"

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

# The units start /usr/bin/node; point them at the Node.js 22 found above when it lives elsewhere
# (for example /usr/local/bin from a manual install).
install_unit() { sed "s#/usr/bin/node #$node_bin #" "$here/$1" > "/etc/systemd/system/$1"; chmod 0644 "/etc/systemd/system/$1"; }

log "Installing the systemd service, health check and journal limit"
for u in "${units[@]}"; do install_unit "$u"; done
install -d /etc/systemd/journald.conf.d
install -m 0644 "$here/journald-prayer-station.conf" /etc/systemd/journald.conf.d/prayer-station.conf
systemctl daemon-reload
systemctl restart systemd-journald
if [ "$listener_only" = 1 ]; then
  systemctl disable --now prayer-tower-station.service prayer-tower-station-health.timer 2>/dev/null || true
else
  systemctl enable prayer-tower-station.service prayer-tower-station-health.timer
  systemctl start prayer-tower-station-health.timer
fi

if [ "$with_listener" = 1 ]; then
  log "Installing the listener node"
  [ -f "$listener_env" ] || install -m 0640 -o root -g "$user" "$here/listener.env.example" "$listener_env"
  install_unit prayer-tower-listener.service
  dropin=/etc/systemd/system/prayer-tower-listener.service.d
  if [ "$with_sdr" = 1 ]; then
    # The listener's sandbox opens only the sound card; an RTL-SDR dongle is a USB device.
    install -d "$dropin"
    printf '%s\n' '# Installed by install.sh --sdr: lets the listener open an RTL-SDR dongle (LISTEN_SOURCE=rtlsdr).' \
      '[Service]' 'DeviceAllow=char-usb_device rw' 'SupplementaryGroups=plugdev' > "$dropin/rtl-sdr.conf"
    grep -q '^LISTEN_SOURCE=' "$listener_env" || printf '%s\n' '' '# RTL-SDR dongle (install.sh --sdr): set the station frequency, e.g. 146.52M.' 'LISTEN_SOURCE=rtlsdr' 'LISTEN_SDR_FREQ=' >> "$listener_env"
  fi
  systemctl daemon-reload
  systemctl enable prayer-tower-listener.service
  if grep -q '^NODE_KEY=$' "$listener_env" || grep -q '^LISTEN_SDR_FREQ=$' "$listener_env"; then
    echo "Fill in $listener_env (NODE_KEY from Admin → Radio → Listener nodes, and LISTEN_SDR_FREQ with --sdr), then: sudo systemctl start prayer-tower-listener"
  else
    systemctl restart prayer-tower-listener.service
  fi
fi

if [ "$with_hamlib" = 1 ]; then
  log "Installing rigctld (rig control)"
  [ -f "$rig_env" ] || install -m 0640 -o root -g "$user" "$here/rigctld.env.example" "$rig_env"
  install -m 0644 "$here/prayer-tower-rigctld.service" /etc/systemd/system/prayer-tower-rigctld.service
  systemctl daemon-reload
  systemctl enable --now prayer-tower-rigctld.service
  systemctl restart prayer-tower-rigctld.service
  grep -q '^RIG_MODEL=1$' "$rig_env" && echo "rigctld runs Hamlib's dummy radio (RIG_MODEL=1, a placeholder). Set your radio in $rig_env." || true
  grep -q '^RIG_CONTROL=rigctld' "$env_file" || echo "Turn rig control on with RIG_CONTROL=rigctld in $env_file." || true
fi

if [ "$listener_only" = 1 ]; then
  log "Listener node installed (the station service is off)"
elif [ "$fresh_env" = 1 ] || grep -q '^STATION_API_KEY=$' "$env_file"; then
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
