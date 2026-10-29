#!/usr/bin/env bash
# Runs one Prayer Tower job on a Mac with its settings file (installed by
# install-mac.sh; launchd starts it). Usage: run.sh station|listener|rigctld|health
set -euo pipefail
base="$HOME/Library/Application Support/PrayerTower"
app="$base/station"
conf="$base/config"
node=$(cat "$app/node-path")
# launchd's PATH is bare: add Node's and Homebrew's folders (rigctld, sox's rec).
export PATH="$(cat "$app/extra-path" 2>/dev/null):$(dirname "$node"):$PATH"
job=${1:?station, listener, rigctld or health}

load() { set -a; # shellcheck disable=SC1090
  . "$conf/$1"; set +a; }

case "$job" in
  station)
    load station.env
    export STATE_DIRECTORY="$base/state"
    set +e
    "$node" "$app/dist/src/main.js"
    code=$?
    set -e
    # 3: a transmission failed and transmit is off. Exit cleanly so launchd does
    # not restart it; a person checks the radio, then: launchctl kickstart gui/$(id -u)/com.zoomatech.prayertower.station
    if [ "$code" = 3 ]; then echo "[station] stopped after a failed transmission; check the radio, then restart it"; exit 0; fi
    exit "$code" ;;
  listener)
    load listener.env
    export STATE_DIRECTORY="$base/state/listener"
    mkdir -p "$STATE_DIRECTORY"
    exec "$node" "$app/dist/src/listener-main.js" ;;
  rigctld)
    load rigctld.env
    args=(-m "$RIG_MODEL" -T 127.0.0.1 -t "${RIG_PORT:-4532}")
    [ -n "${RIG_DEVICE:-}" ] && args+=(-r "$RIG_DEVICE")
    [ -n "${RIG_SPEED:-}" ] && args+=(-s "$RIG_SPEED")
    # shellcheck disable=SC2086
    exec rigctld "${args[@]}" ${RIG_EXTRA_ARGS:-} ;;
  health)
    export STATION_ENV_FILE="$conf/station.env" HEARTBEAT_FILE="$base/state/heartbeat"
    exec "$node" "$app/dist/src/health.js" ;;
  *) echo "unknown job $job" >&2; exit 2 ;;
esac
