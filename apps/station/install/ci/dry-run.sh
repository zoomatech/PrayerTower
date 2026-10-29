#!/usr/bin/env bash
# Dry run of the station installers in CI (.github/workflows/station-install.yml), on a throwaway
# machine: install, point the station at a stand-in API (mock-api.mjs) in simulate mode (nothing
# keyed), check it claims two prayers, "sends" them as a burst, decodes them back and reports
# them, check the health check and rig control (Hamlib's dummy radio), install again as an
# update, then uninstall. Never run this on a station that's on the air.
#   bash apps/station/install/ci/dry-run.sh linux   # Ubuntu/Debian with systemd (needs sudo)
#   bash apps/station/install/ci/dry-run.sh mac     # macOS, launchd agents for this user
set -euo pipefail
platform=${1:?linux or mac}
here=$(cd "$(dirname "$0")" && pwd)
install=$(cd "$here/.." && pwd)
work=$(mktemp -d)
calls="$work/calls.json"

step() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nDRY RUN FAILED: %s\n' "$*" >&2; dump; exit 1; }

node "$here/mock-api.mjs" "$calls" 8787 > "$work/mock.log" 2>&1 &
mock=$!
trap 'kill $mock 2>/dev/null || true' EXIT

# key=value in a settings file, replacing any line for that key (keeps the file's owner and mode).
setkey() {
  local file=$1 key=$2 value=$3 tmp
  tmp=$(mktemp)
  { $SUDO cat "$file" | grep -v "^$key=" || true; printf '%s=%s\n' "$key" "$value"; } > "$tmp"
  $SUDO cp "$tmp" "$file"
  rm -f "$tmp"
}
configure() {
  local file=$1
  setkey "$file" PRAYER_TOWER_API_URL http://127.0.0.1:8787
  setkey "$file" ALLOW_INSECURE_HTTP 1
  setkey "$file" STATION_API_KEY ci-station-key
  setkey "$file" CALL_SIGN N0CALL
  setkey "$file" BURST_MODE simulate
  setkey "$file" BURST_PRESET fm-standard
  setkey "$file" POLL_SECONDS 2
  setkey "$file" STATION_ID cw
  setkey "$file" RIG_CONTROL rigctld
}
wait_for_burst() {
  for _ in $(seq 1 60); do
    node "$here/check-burst.mjs" "$calls" && return 0
    sleep 2
  done
  node "$here/check-burst.mjs" "$calls" --print || true
  return 1
}

if [ "$platform" = linux ]; then
  SUDO=sudo
  env_file=/etc/prayer-tower-station.env
  app=/opt/prayer-tower-station
  dump() {
    sudo journalctl -u prayer-tower-station -u prayer-tower-rigctld -u prayer-tower-station-health --no-pager -n 80 || true
    sudo ls -la /var/lib/prayer-tower-station/ || true
    cat "$work/mock.log" || true
  }

  step "Install (with Hamlib and a listener node with an RTL-SDR dongle)"
  sudo bash "$install/install.sh" --hamlib --listener --sdr
  [ -f "$app/dist/src/main.js" ] || fail "the worker is not in $app"
  command -v rtl_fm > /dev/null || fail "rtl_fm (--sdr) is not installed"
  [ -f /etc/systemd/system/prayer-tower-listener.service.d/rtl-sdr.conf ] || fail "the listener can't open a USB dongle"
  sudo grep -q '^LISTEN_SOURCE=rtlsdr$' /etc/prayer-tower-listener.env || fail "--sdr did not set LISTEN_SOURCE"
  for u in prayer-tower-station.service prayer-tower-station-health.timer prayer-tower-listener.service prayer-tower-rigctld.service; do
    systemctl is-enabled --quiet "$u" || fail "$u is not enabled"
  done
  systemctl is-active --quiet prayer-tower-rigctld || fail "rigctld (dummy radio) is not running"
  sudo systemd-analyze verify /etc/systemd/system/prayer-tower-*.service /etc/systemd/system/prayer-tower-*.timer || fail "systemd-analyze verify"

  step "Simulate mode against the stand-in API"
  configure "$env_file"
  sudo systemctl restart prayer-tower-station
  wait_for_burst || fail "no burst was sent, decoded and reported"
  systemctl is-active --quiet prayer-tower-station || fail "the station stopped"
  sudo journalctl -u prayer-tower-station --no-pager | grep -q "station ID (CW)" || fail "no station ID after the burst"
  sudo ls /var/lib/prayer-tower-station/bursts | grep -q '\.wav$' || fail "no burst WAV in the state directory"

  step "Health check"
  sudo systemctl start prayer-tower-station-health.service || fail "the health check failed"

  step "Install again (update): settings kept, station restarted"
  sudo bash "$install/install.sh" --hamlib --listener --sdr
  sudo grep -q '^STATION_API_KEY=ci-station-key$' "$env_file" || fail "the update lost the settings"
  sleep 3
  systemctl is-active --quiet prayer-tower-station || fail "the station is not running after the update"

  step "Uninstall"
  sudo bash "$install/install.sh" --uninstall
  [ ! -e "$app" ] || fail "$app is still there"
  [ ! -e /etc/systemd/system/prayer-tower-station.service ] || fail "the service is still installed"
  [ ! -e /etc/systemd/system/prayer-tower-listener.service.d ] || fail "the listener's dongle drop-in is still there"
  [ -f "$env_file" ] || fail "uninstall removed the settings file"
elif [ "$platform" = mac ]; then
  SUDO=
  base="$HOME/Library/Application Support/PrayerTower"
  conf="$base/config"
  logs="$HOME/Library/Logs/PrayerTower"
  label=com.zoomatech.prayertower
  uid=$(id -u)
  dump() { tail -n 80 "$logs/station.log" "$logs/rigctld.log" 2>/dev/null || true; cat "$work/mock.log" || true; }
  running() { launchctl print "gui/$uid/$label.$1" 2>/dev/null | grep -q 'state = running'; }

  step "Install (with Hamlib and a listener node with an RTL-SDR dongle)"
  bash "$install/mac/install-mac.sh" --hamlib --listener --sdr
  [ -f "$base/station/dist/src/main.js" ] || fail "the worker is not in $base/station"
  command -v rtl_fm > /dev/null || [ -x "$(brew --prefix)/bin/rtl_fm" ] || fail "rtl_fm (--sdr) is not installed"
  grep -q '^LISTEN_SOURCE=rtlsdr$' "$conf/listener.env" || fail "--sdr did not set LISTEN_SOURCE"
  [ -f "$conf/station.env" ] && [ -f "$conf/rigctld.env" ] && [ -f "$conf/listener.env" ] || fail "settings files missing"
  plutil -lint "$HOME/Library/LaunchAgents/$label.rigctld.plist" || fail "rigctld agent plist"
  sleep 3
  running rigctld || fail "rigctld (dummy radio) is not running"

  step "Simulate mode against the stand-in API (installing again starts the station)"
  configure "$conf/station.env"
  bash "$install/mac/install-mac.sh" --hamlib --listener --sdr
  plutil -lint "$HOME/Library/LaunchAgents/$label.station.plist" || fail "station agent plist"
  wait_for_burst || fail "no burst was sent, decoded and reported"
  running station || fail "the station stopped"
  ls "$base/state/bursts" | grep -q '\.wav$' || fail "no burst WAV in the state folder"
  grep -q "station ID (CW)" "$logs/station.log" || fail "no station ID after the burst"

  step "Health check"
  bash "$base/station/run.sh" health || fail "the health check failed"

  step "Uninstall"
  bash "$install/mac/install-mac.sh" --uninstall
  [ ! -e "$base/station" ] || fail "the station is still installed"
  [ ! -e "$HOME/Library/LaunchAgents/$label.station.plist" ] || fail "the station agent is still there"
  [ -f "$conf/station.env" ] || fail "uninstall removed the settings"
else
  echo "usage: dry-run.sh linux|mac" >&2
  exit 2
fi
step "Dry run passed"
