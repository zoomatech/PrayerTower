#!/usr/bin/env bash
# App Store screenshots of the native app, headless: the Simulator boots in the background (no
# Simulator window), the app runs with its on-device sample data (-PTSampleData, no server or
# account), and `xcrun simctl io … screenshot` saves each screen. See docs/NATIVE_TESTFLIGHT.md.
#
#   scripts/mac-screenshots-native.sh               # Prayer Tower
#   scripts/mac-screenshots-native.sh opencircle    # Open Circle
#
# Needs an iOS Simulator runtime (once: xcodebuild -downloadPlatform iOS, about 8 GB).
# Output: store-screenshots/native/<edition>/<device>/<screen>.png
set -uo pipefail

EDITION="${1:-prayertower}"
case "$EDITION" in
  prayertower) SCHEME=PrayerTowerNative; BUNDLE=com.zoomatech.prayertower.native ;;
  opencircle) SCHEME=OpenCircleNative; BUNDLE=com.zoomatech.opencircle.native ;;
  *) echo "Unknown edition: $EDITION (prayertower or opencircle)"; exit 2 ;;
esac
SCREENS=(feed post promises messages notices me)
# The largest iPhone and iPad sizes App Store Connect asks for; it scales them down for smaller ones.
DEVICES=("iPhone .* Pro Max" "iPad Pro 13-inch.*")

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/ios-native"
OUT="$ROOT/store-screenshots/native/$EDITION"
LOGS="$ROOT/build-logs/screenshots-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT" "$LOGS"
if [ "$(uname)" != Darwin ]; then echo "This script runs on a Mac with Xcode."; exit 2; fi

RUNTIME=$(xcrun simctl list runtimes available -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x["platform"]=="iOS"]; print(r[-1]["identifier"] if r else "")')
if [ -z "$RUNTIME" ]; then
  echo "No iOS Simulator runtime is installed. Install it once with: xcodebuild -downloadPlatform iOS"
  exit 2
fi

# The project and the app, built for the Simulator.
SKIP_BUILD=1 "$ROOT/scripts/mac-build-native.sh" > "$LOGS/prepare.txt" 2>&1 || { echo "Preparing the project failed; see $LOGS/prepare.txt"; exit 1; }
cd "$APP"
if ! xcodebuild -project PrayerTowerNative.xcodeproj -scheme "$SCHEME" -destination "generic/platform=iOS Simulator" \
     -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO build > "$LOGS/build.txt" 2>&1; then
  echo "Build failed; see $LOGS/build.txt"; exit 1
fi
BUILT="$ROOT/build-logs/derived-native/Build/Products/Debug-iphonesimulator/$SCHEME.app"

for PATTERN in "${DEVICES[@]}"; do
  TYPE=$(xcrun simctl list devicetypes -j | python3 -c "import json,re,sys; t=[x for x in json.load(sys.stdin)['devicetypes'] if re.fullmatch(r'''$PATTERN''', x['name'])]; print(t[-1]['identifier'] + '|' + t[-1]['name'] if t else '')")
  if [ -z "$TYPE" ]; then echo "No device type matches '$PATTERN'; skipped."; continue; fi
  NAME="${TYPE#*|}"
  UDID=$(xcrun simctl create "Store shots $NAME" "${TYPE%%|*}" "$RUNTIME")
  # Boots in the background; Simulator.app is never opened.
  xcrun simctl boot "$UDID" && xcrun simctl bootstatus "$UDID" -b > /dev/null
  xcrun simctl status_bar "$UDID" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100
  xcrun simctl install "$UDID" "$BUILT"
  mkdir -p "$OUT/$NAME"
  for SCREEN in "${SCREENS[@]}"; do
    xcrun simctl terminate "$UDID" "$BUNDLE" > /dev/null 2>&1 || true
    xcrun simctl launch "$UDID" "$BUNDLE" -PTSampleData -PTScreen "$SCREEN" > /dev/null
    sleep 4
    xcrun simctl io "$UDID" screenshot "$OUT/$NAME/$SCREEN.png" > /dev/null 2>&1 && echo "Saved $NAME/$SCREEN.png"
  done
  xcrun simctl shutdown "$UDID"
  xcrun simctl delete "$UDID"
done
echo "Screenshots: $OUT"
