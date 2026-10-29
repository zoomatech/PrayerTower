#!/usr/bin/env bash
# One command on Steve's Mac for the native SwiftUI app (apps/ios-native, docs/SWIFT_PORT.md):
#   1. swift test for the shared package (PrayerTowerKit, PrayerTowerSession),
#   2. xcodegen generate (after building the cross-posting Safari extension into Crosspost/), then build
#      both apps (with their widgets and Safari extensions) for the iOS Simulator and the Mac operator console (no signing needed),
# and print a pass/fail table. Logs go to build-logs/native-<time>/.
# Needs Xcode. XcodeGen comes from Homebrew when it can install there; otherwise (for example
# when Homebrew belongs to another macOS account) it is built from its tagged source with
# Swift Package Manager into ~/Library/Caches/prayertower, as XcodeGen's README documents. No CocoaPods, no sudo.
# Without Config.xcconfig it builds with the example config, which is fine for a compile check.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/ios-native"
LOGS="$ROOT/build-logs/native-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$LOGS"
RESULTS=()
FAILED=0
record() { RESULTS+=("$(printf '%-18s %-6s %s' "$1" "$2" "$3")"); [ "$2" = FAIL ] && FAILED=1; return 0; }

if [ "$(uname)" != Darwin ]; then echo "This script runs on a Mac with Xcode."; exit 2; fi
if ! xcodebuild -version > "$LOGS/xcode-version.txt" 2>&1; then
  echo "xcodebuild not found. Install Xcode from the App Store, open it once, then run:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 2
fi
XCODEGEN_VERSION=2.46.0
XCODEGEN=$(command -v xcodegen || true)
if [ -z "$XCODEGEN" ] && command -v brew >/dev/null && [ -w "$(brew --prefix)/bin" ]; then
  brew install xcodegen > "$LOGS/brew.txt" 2>&1 && XCODEGEN=$(command -v xcodegen || true)
fi
if [ -z "$XCODEGEN" ]; then
  TOOL="$HOME/Library/Caches/prayertower/XcodeGen-$XCODEGEN_VERSION"
  if [ ! -x "$TOOL/.build/release/xcodegen" ]; then
    echo "Building XcodeGen $XCODEGEN_VERSION from source (one time, a few minutes)..."
    rm -rf "$TOOL"
    git clone --quiet --depth 1 --branch "$XCODEGEN_VERSION" https://github.com/yonaskolb/XcodeGen.git "$TOOL" > "$LOGS/xcodegen-build.txt" 2>&1 &&
      swift build --package-path "$TOOL" -c release --product xcodegen >> "$LOGS/xcodegen-build.txt" 2>&1 ||
      { echo "Could not build XcodeGen; see $LOGS/xcodegen-build.txt"; exit 2; }
  fi
  XCODEGEN="$TOOL/.build/release/xcodegen"
fi

# The native app's words come from the Expo app's (apps/mobile/src/lib/native-strings.ts).
if command -v npm >/dev/null && [ -d "$ROOT/node_modules" ]; then
  (cd "$ROOT" && npm run native-strings -w @prayer-tower/mobile > "$LOGS/native-strings.txt" 2>&1) &&
    record "Words" PASS "from the Expo app" || record "Words" FAIL "$LOGS/native-strings.txt"
fi

cd "$APP"
# SKIP_BUILD=1 (scripts/mac-archive-native.sh) only prepares the project: words, the Safari
# extension's files and xcodegen.
if [ -n "${SKIP_BUILD:-}" ]; then :
elif swift test > "$LOGS/swift-test.txt" 2>&1; then
  record "Shared tests" PASS "$(grep -oE 'Test run with [0-9]+ tests' "$LOGS/swift-test.txt" | tail -1)"
else
  record "Shared tests" FAIL "$LOGS/swift-test.txt"
fi

[ -f Config.xcconfig ] || cp Config.example.xcconfig Config.xcconfig
# The cross-posting Safari extension inside each app: apps/extension built for Safari, per edition.
for EDITION in prayertower opencircle; do
  if DIST="$(node "$ROOT/apps/extension/scripts/build.mjs" "$EDITION" --safari 2> "$LOGS/crosspost-$EDITION.txt")"; then
    rm -rf "Crosspost/$EDITION" && cp -R "$DIST" "Crosspost/$EDITION"
  else
    record "Safari extension" FAIL "$LOGS/crosspost-$EDITION.txt"
  fi
done
if "$XCODEGEN" generate > "$LOGS/xcodegen.txt" 2>&1; then
  record "Xcode project" PASS "PrayerTowerNative.xcodeproj"
else
  record "Xcode project" FAIL "$LOGS/xcodegen.txt"
fi
if [ -n "${SKIP_BUILD:-}" ]; then printf '%s\n' "${RESULTS[@]}"; exit $FAILED; fi

SIM=$(xcrun simctl list devices available -j 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; print(next((x["udid"] for k,v in d.items() if "iOS" in k for x in v if x["name"].startswith("iPhone")), ""))')
DEST=${SIM:+"id=$SIM"}
DEST=${DEST:-"generic/platform=iOS Simulator"}
if xcodebuild -project PrayerTowerNative.xcodeproj -scheme PrayerTowerNative -destination "$DEST" \
     -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO build > "$LOGS/app-build.txt" 2>&1; then
  record "iPhone app" PASS "iOS Simulator ($DEST)"
else
  record "iPhone app" FAIL "$LOGS/app-build.txt"
  grep -E "error:" "$LOGS/app-build.txt" | sort -u | head -20 > "$LOGS/errors.txt"
fi

# UI walks of the main screens (apps/ios-native/UIWalks) with the app's sample data. xcodebuild
# boots the Simulator in the background: no Simulator window opens. Shut down afterwards.
if [ -n "$SIM" ]; then
  if xcodebuild -project PrayerTowerNative.xcodeproj -scheme PrayerTowerNative -destination "id=$SIM" \
       -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO test > "$LOGS/ui-walks.txt" 2>&1; then
    record "UI walks" PASS "$(grep -oE 'Executed [0-9]+ tests?, with 0 failures' "$LOGS/ui-walks.txt" | tail -1)"
  else
    record "UI walks" FAIL "$LOGS/ui-walks.txt"
    grep -E "error:|failed" "$LOGS/ui-walks.txt" | sort -u | head -20 >> "$LOGS/errors.txt"
  fi
  xcrun simctl shutdown "$SIM" > /dev/null 2>&1 || true
else
  record "UI walks" FAIL "no iPhone Simulator installed"
fi

# The Open Circle edition: the same screens under its own name and bundle id.
if grep -q "OpenCircleNative:" project.yml; then
  if xcodebuild -project PrayerTowerNative.xcodeproj -scheme OpenCircleNative -destination "$DEST" \
       -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO build > "$LOGS/open-circle-build.txt" 2>&1; then
    record "Open Circle app" PASS "iOS Simulator ($DEST)"
  else
    record "Open Circle app" FAIL "$LOGS/open-circle-build.txt"
    grep -E "error:" "$LOGS/open-circle-build.txt" | sort -u | head -20 >> "$LOGS/errors.txt"
  fi
fi

# The member app for the Mac (the same screens as the iPhone and iPad app).
if xcodebuild -project PrayerTowerNative.xcodeproj -scheme PrayerTowerMac -destination "platform=macOS" \
     -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO build > "$LOGS/mac-app-build.txt" 2>&1; then
  record "Mac app" PASS "macOS"
else
  record "Mac app" FAIL "$LOGS/mac-app-build.txt"
  grep -E "error:" "$LOGS/mac-app-build.txt" | sort -u | head -30 >> "$LOGS/errors.txt"
fi

# The Mac operator console (Console/), built for this Mac.
if xcodebuild -project PrayerTowerNative.xcodeproj -scheme PrayerTowerConsole -destination "platform=macOS" \
     -derivedDataPath "$ROOT/build-logs/derived-native" CODE_SIGNING_ALLOWED=NO build > "$LOGS/console-build.txt" 2>&1; then
  record "Mac console" PASS "macOS"
else
  record "Mac console" FAIL "$LOGS/console-build.txt"
  grep -E "error:" "$LOGS/console-build.txt" | sort -u | head -20 >> "$LOGS/errors.txt"
fi

echo
printf '%s\n' "${RESULTS[@]}"
[ -s "$LOGS/errors.txt" ] && { echo; echo "First errors:"; cat "$LOGS/errors.txt"; }
echo "Logs: $LOGS"
exit $FAILED
