#!/usr/bin/env bash
# Installs (or updates) the Prayer Tower radio station on a Mac, as launchd
# agents for the signed-in user (no sudo). Guide: docs/STATION_OPERATOR_GUIDE.md,
# "Station on a Mac".
#
#   bash apps/station/install/mac/install-mac.sh [--hamlib] [--listener] [--listener-only] [--sdr]
#   bash apps/station/install/mac/install-mac.sh --uninstall
# Or with nothing cloned:
#   curl -fsSL https://raw.githubusercontent.com/zoomatech/PrayerTower/main/apps/station/install/mac/install-mac.sh | bash -s -- --hamlib
#
#   --hamlib         also run Hamlib rigctld (rig control), from Homebrew
#   --listener       also run a receive-only listener node (records with sox, from Homebrew)
#   --listener-only  a listener node only: the station agent stays off
#   --sdr            the listener node hears through an RTL-SDR USB dongle (rtl_fm, from Homebrew's librtlsdr)
#   --repo URL / --branch NAME  where to fetch the code when not run from a clone
set -euo pipefail

base="$HOME/Library/Application Support/PrayerTower"
app="$base/station"
conf="$base/config"
state="$base/state"
logs="$HOME/Library/Logs/PrayerTower"
agents="$HOME/Library/LaunchAgents"
label=com.zoomatech.prayertower
repo_url=${PRAYER_TOWER_REPO:-https://github.com/zoomatech/PrayerTower.git}
branch=main

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
[ "$(uname -s)" = Darwin ] || die "this is the Mac installer; on a Pi or Linux use apps/station/install/install.sh"
[ "$(id -u)" -ne 0 ] || die "run without sudo: the station runs as you, from your login"

uid=$(id -u)
unload() {
  launchctl bootout "gui/$uid/$label.$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do launchctl print "gui/$uid/$label.$1" > /dev/null 2>&1 || break; sleep 0.5; done
  rm -f "$agents/$label.$1.plist"
}

with_hamlib=0 with_listener=0 listener_only=0 with_sdr=0 uninstall=0
while [ $# -gt 0 ]; do
  case "$1" in
    --hamlib) with_hamlib=1 ;;
    --listener) with_listener=1 ;;
    --listener-only) with_listener=1; listener_only=1 ;;
    --sdr) with_sdr=1; with_listener=1 ;;
    --uninstall) uninstall=1 ;;
    --repo) repo_url=${2:?--repo needs a URL}; shift ;;
    --branch) branch=${2:?--branch needs a name}; shift ;;
    *) die "unknown option $1" ;;
  esac
  shift
done

if [ "$uninstall" = 1 ]; then
  log "Removing the station agents"
  for j in station rigctld listener; do unload "$j"; done
  rm -rf "$app" "$base/src"
  echo "Removed. Settings in $conf and logs in $logs were kept; delete them by hand if you want."
  exit 0
fi

# The code: the clone this script is in, or a fresh copy.
here=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /nonexistent)
if [ -f "$here/../install.sh" ] && [ -d "$here/../../../../apps/station" ]; then
  repo=$(cd "$here/../../../.." && pwd)
else
  log "Fetching Prayer Tower ($branch)"
  command -v git >/dev/null || die "git is missing: run xcode-select --install, then try again"
  if [ -d "$base/src/.git" ]; then
    git -C "$base/src" remote set-url origin "$repo_url"
    git -C "$base/src" fetch -q --depth 1 origin "$branch"
    git -C "$base/src" checkout -q -B "$branch" FETCH_HEAD
  else
    mkdir -p "$base"
    git clone -q --depth 1 --branch "$branch" "$repo_url" "$base/src"
  fi
  git -C "$base/src" remote set-url origin "${repo_url/\/\/*@/\/\/}"
  repo="$base/src"
fi

# Node.js 22 or newer: the one on PATH, else Homebrew's node@22 (https://formulae.brew.sh/formula/node@22).
node_bin=$(command -v node || true)
node_major=$([ -n "$node_bin" ] && "$node_bin" -p 'process.versions.node.split(".")[0]' || echo 0)
if [ "$node_major" -lt 22 ]; then
  command -v brew >/dev/null || die "Node.js 22 is needed: install it from https://nodejs.org or install Homebrew (https://brew.sh), then run this again"
  log "Installing Node.js 22 (Homebrew)"
  brew install node@22
  node_bin="$(brew --prefix node@22)/bin/node"
fi
"$node_bin" -v
npm_bin="$(dirname "$node_bin")/npm"

if [ "$with_hamlib" = 1 ] || [ "$with_listener" = 1 ]; then
  command -v brew >/dev/null || die "Homebrew is needed for Hamlib and sox: https://brew.sh"
  if [ "$with_hamlib" = 1 ]; then log "Installing Hamlib (Homebrew)"; brew install hamlib; fi
  if [ "$with_listener" = 1 ]; then log "Installing sox (Homebrew)"; brew install sox; fi
  if [ "$with_sdr" = 1 ]; then log "Installing librtlsdr (Homebrew)"; brew install librtlsdr; fi
fi

log "Building the worker"
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
mkdir -p "$build/apps"
cp "$repo/package.json" "$repo/package-lock.json" "$build/"
cp -R "$repo/apps/station" "$build/apps/station"
rm -rf "$build/apps/station/node_modules" "$build/apps/station/dist"
(cd "$build" && PATH="$(dirname "$node_bin"):$PATH" "$npm_bin" ci --workspace @prayer-tower/station --include-workspace-root=false --no-audit --no-fund --loglevel=error \
  && PATH="$(dirname "$node_bin"):$PATH" "$npm_bin" run build --workspace @prayer-tower/station --silent)

log "Installing to $app"
mkdir -p "$conf" "$state" "$logs" "$agents"
rm -rf "$app.new"
mkdir -p "$app.new"
cp -R "$build/apps/station/dist" "$build/apps/station/package.json" "$app.new/"
cp "$repo/apps/station/install/mac/run.sh" "$app.new/run.sh"
chmod +x "$app.new/run.sh"
rm -rf "$app"
mv "$app.new" "$app"
printf '%s\n' "$node_bin" > "$app/node-path"
# launchd starts jobs with a bare PATH: remember where Homebrew's rigctld and rec are.
if command -v brew >/dev/null; then printf '%s\n' "$(brew --prefix)/bin" > "$app/extra-path"; else : > "$app/extra-path"; fi

copy_conf() { [ -f "$conf/$2" ] || { cp "$repo/apps/station/install/$1" "$conf/$2"; chmod 600 "$conf/$2"; }; }
copy_conf station.env.example station.env
if [ "$with_hamlib" = 1 ]; then copy_conf rigctld.env.example rigctld.env; fi
if [ "$with_listener" = 1 ]; then copy_conf listener.env.example listener.env; fi
if [ "$with_sdr" = 1 ] && ! grep -q '^LISTEN_SOURCE=' "$conf/listener.env"; then
  printf '%s\n' '' '# RTL-SDR dongle (--sdr): set the station frequency, e.g. 146.52M.' 'LISTEN_SOURCE=rtlsdr' 'LISTEN_SDR_FREQ=' >> "$conf/listener.env"
fi
# On a Mac, bursts play with afplay and the listener records with sox.
# Quoted: run.sh reads the settings with bash, where an unquoted space ends the value.
grep -q '^BURST_PLAY_CMD=' "$conf/station.env" || printf '%s\n' '# macOS: afplay plays to the default output; pick the USB interface in System Settings > Sound.' "BURST_PLAY_CMD='afplay {wav}'" >> "$conf/station.env"
# Earlier installers wrote it unquoted, which stopped the station from starting.
sed -i '' "s/^BURST_PLAY_CMD=afplay {wav}$/BURST_PLAY_CMD='afplay {wav}'/" "$conf/station.env"

# One launchd agent per job (launchd.plist(5)). KeepAlive restarts a job that
# fails; run.sh turns the station's "transmit failed" exit (3) into a clean
# stop, so a person checks the radio before it keys again.
agent() {
  local job=$1
  cat > "$agents/$label.$job.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label.$job</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$app/run.sh</string><string>$job</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$logs/$job.log</string>
  <key>StandardErrorPath</key><string>$logs/$job.log</string>
</dict>
</plist>
PLIST
  # bootout returns before the job is gone, and bootstrapping it again too soon fails
  # ("Bootstrap failed: 5: Input/output error"): wait for it to go, then try a few times.
  launchctl bootout "gui/$uid/$label.$job" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do launchctl print "gui/$uid/$label.$job" > /dev/null 2>&1 || break; sleep 0.5; done
  for try in 1 2 3 4 5; do
    launchctl bootstrap "gui/$uid" "$agents/$label.$job.plist" && return 0
    [ "$try" = 5 ] || sleep 1
  done
  die "launchd would not start $label.$job"
}

ready() { ! grep -q "^$2=\$" "$conf/$1"; }
if [ "$with_hamlib" = 1 ]; then log "Starting rigctld (RIG_MODEL=1 is Hamlib's dummy radio, a placeholder)"; agent rigctld; fi
if [ "$listener_only" = 1 ]; then
  unload station
elif ready station.env STATION_API_KEY; then
  log "Starting the station"; agent station
else
  unload station
  echo "Fill in $conf/station.env (API URL, STATION_API_KEY, CALL_SIGN), then run this installer again to start it."
fi
if [ "$with_listener" = 1 ]; then
  if ready listener.env NODE_KEY && ready listener.env LISTEN_SDR_FREQ; then log "Starting the listener node"; agent listener
  else echo "Fill in $conf/listener.env (NODE_KEY from Admin → Radio → Listener nodes, and LISTEN_SDR_FREQ with --sdr), then run this installer again."; fi
fi

cat <<MSG

Settings: $conf
Logs:     tail -f "$logs/station.log"
Health:   bash "$app/run.sh" health
Stop:     launchctl bootout gui/$uid/$label.station
MSG
