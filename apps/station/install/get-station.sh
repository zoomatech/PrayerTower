#!/usr/bin/env bash
# One command to set up a Prayer Tower radio station on a Raspberry Pi (or any
# Debian/Ubuntu machine): fetches the code and runs install.sh.
# Guide: docs/STATION_OPERATOR_GUIDE.md, "One-command install".
#
#   curl -fsSL https://raw.githubusercontent.com/zoomatech/PrayerTower/main/apps/station/install/get-station.sh | sudo bash -s -- --hamlib
#
# Options are passed to install.sh (--hamlib, --fldigi, --uninstall), plus:
#   --repo URL     where to fetch the code (default below; a private copy needs
#                  a URL with access, e.g. https://<token>@github.com/...)
#   --branch NAME  which branch (default main)
# Running it again updates the code and the station, keeping the settings files.
set -euo pipefail

repo_url=${PRAYER_TOWER_REPO:-https://github.com/zoomatech/PrayerTower.git}
branch=main
src=/opt/prayer-tower-src
pass=()
while [ $# -gt 0 ]; do
  case "$1" in
    --repo) repo_url=${2:?--repo needs a URL}; shift 2 ;;
    --branch) branch=${2:?--branch needs a name}; shift 2 ;;
    *) pass+=("$1"); shift ;;
  esac
done

[ "$(id -u)" -eq 0 ] || { echo "Error: run with sudo" >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Error: this needs Raspberry Pi OS, Debian or Ubuntu" >&2; exit 1; }

echo "==> Fetching Prayer Tower ($branch)"
command -v git >/dev/null || { apt-get update -qq && apt-get install -y -qq git ca-certificates; }
if [ -d "$src/.git" ]; then
  git -C "$src" remote set-url origin "$repo_url"
  git -C "$src" fetch --depth 1 origin "$branch"
  git -C "$src" checkout -q -B "$branch" FETCH_HEAD
else
  rm -rf "$src"
  git clone -q --depth 1 --branch "$branch" "$repo_url" "$src"
fi
# Don't keep a token from --repo on disk.
git -C "$src" remote set-url origin "${repo_url/\/\/*@/\/\/}"

exec "$src/apps/station/install/install.sh" "${pass[@]}"
