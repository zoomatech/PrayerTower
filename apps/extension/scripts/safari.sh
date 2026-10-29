#!/usr/bin/env bash
# On a Mac with Xcode: build the Safari version of the cross-posting extension
# for iPhone, iPad and Mac. Apple's packager wraps it in a small native Swift app
# (the way Safari extensions are installed), in build/safari/<edition>/.
#
#   apps/extension/scripts/safari.sh              # Prayer Tower
#   apps/extension/scripts/safari.sh opencircle   # Open Circle
#
# Then open the Xcode project it prints, pick your team under Signing, and run it on
# a phone or upload it to App Store Connect. See docs/CROSSPOST.md.
set -euo pipefail

EDITION="${1:-prayertower}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
case "$EDITION" in
  prayertower) NAME="Prayer Tower Cross-posting"; BUNDLE="com.zoomatech.prayertower.crosspost" ;;
  opencircle) NAME="Open Circle Cross-posting"; BUNDLE="com.zoomatech.opencircle.crosspost" ;;
  *) echo "Unknown edition: $EDITION (prayertower or opencircle)"; exit 2 ;;
esac

if ! xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  echo "Apple's Safari packager was not found. Install Xcode from the App Store, open it once, then run this again."
  exit 1
fi

DIST="$(node "$HERE/scripts/build.mjs" "$EDITION" --safari)"
OUT="$ROOT/build/safari/$EDITION"
xcrun safari-web-extension-packager "$DIST" \
  --project-location "$OUT" \
  --app-name "$NAME" \
  --bundle-identifier "$BUNDLE" \
  --swift --copy-resources --no-open --no-prompt --force
echo "Xcode project: $OUT"
