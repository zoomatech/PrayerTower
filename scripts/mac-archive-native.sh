#!/usr/bin/env bash
# Archive the native iPhone app (apps/ios-native) for TestFlight, headless: no Xcode window,
# no Simulator. See docs/NATIVE_TESTFLIGHT.md.
#
#   scripts/mac-archive-native.sh                 # Prayer Tower: archive, export an .ipa
#   scripts/mac-archive-native.sh opencircle      # Open Circle
#   UPLOAD=1 scripts/mac-archive-native.sh        # archive and upload to App Store Connect
#
# Settings (environment, or the same names in apps/ios-native/Config.xcconfig):
#   PT_TEAM_ID       the Apple Developer Team ID (10 characters). Required.
#   PT_VERSION       the version people see (default 0.1.0)
#   PT_BUILD         the build number (default: seconds since 2026-01-01, always increasing)
#   ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID
#                    an App Store Connect API key (.p8) for signing and upload without an
#                    Xcode account signed in. Optional when Xcode already has the account.
# Every target (the app, its widget and its Safari extension) gets the same version and build,
# as App Store Connect requires. Output: build/native-archive/<edition>-<build>/.
set -uo pipefail

EDITION="${1:-prayertower}"
case "$EDITION" in
  prayertower) SCHEME=PrayerTowerNative ;;
  opencircle) SCHEME=OpenCircleNative ;;
  *) echo "Unknown edition: $EDITION (prayertower or opencircle)"; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/apps/ios-native"
if [ "$(uname)" != Darwin ]; then echo "This script runs on a Mac with Xcode."; exit 2; fi

# A setting from the environment, else from Config.xcconfig ("NAME = value").
setting() {
  local v="${!1:-}"
  if [ -z "$v" ] && [ -f "$APP/Config.xcconfig" ]; then
    v="$(sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$APP/Config.xcconfig" | tail -1 | sed 's/[[:space:]]*$//')"
  fi
  printf '%s' "$v"
}
TEAM="$(setting PT_TEAM_ID)"
VERSION="$(setting PT_VERSION)"; VERSION="${VERSION:-0.1.0}"
BUILD="$(setting PT_BUILD)"; BUILD="${BUILD:-$(( $(date +%s) - 1767225600 ))}"
KEY_PATH="$(setting ASC_KEY_PATH)"; KEY_ID="$(setting ASC_KEY_ID)"; ISSUER="$(setting ASC_ISSUER_ID)"

if ! [[ "$TEAM" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "Set PT_TEAM_ID to your Apple Developer Team ID (10 letters and digits, from"
  echo "developer.apple.com → Membership details), in the environment or apps/ios-native/Config.xcconfig."
  exit 2
fi

OUT="$ROOT/build/native-archive/$EDITION-$BUILD"
mkdir -p "$OUT"
AUTH=(-allowProvisioningUpdates)
if [ -n "$KEY_PATH" ]; then
  AUTH+=(-authenticationKeyPath "$KEY_PATH" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER")
fi

# The project, the Safari extension's files and the words, exactly as the headless build makes them.
SKIP_BUILD=1 "$ROOT/scripts/mac-build-native.sh" > "$OUT/prepare.txt" 2>&1 || { echo "Preparing the project failed; see $OUT/prepare.txt"; exit 1; }

cd "$APP"
echo "Archiving $SCHEME $VERSION ($BUILD)..."
if ! xcodebuild -project PrayerTowerNative.xcodeproj -scheme "$SCHEME" -configuration Release \
     -destination "generic/platform=iOS" -archivePath "$OUT/$SCHEME.xcarchive" \
     DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
     MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" \
     "${AUTH[@]}" archive > "$OUT/archive.txt" 2>&1; then
  echo "Archive failed; see $OUT/archive.txt"
  grep -E "error:" "$OUT/archive.txt" | sort -u | head -20
  exit 1
fi

DESTINATION=export
[ "${UPLOAD:-0}" = 1 ] && DESTINATION=upload
cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>destination</key>
	<string>$DESTINATION</string>
	<key>teamID</key>
	<string>$TEAM</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>uploadSymbols</key>
	<true/>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
</dict>
</plist>
PLIST

echo "Exporting ($DESTINATION)..."
if ! xcodebuild -exportArchive -archivePath "$OUT/$SCHEME.xcarchive" -exportPath "$OUT/export" \
     -exportOptionsPlist "$OUT/ExportOptions.plist" "${AUTH[@]}" > "$OUT/export.txt" 2>&1; then
  echo "Export failed; see $OUT/export.txt"
  grep -E "error:" "$OUT/export.txt" | sort -u | head -20
  exit 1
fi
if [ "$DESTINATION" = upload ]; then
  echo "Uploaded $SCHEME $VERSION ($BUILD) to App Store Connect. It shows in TestFlight after Apple's processing."
else
  echo "Exported: $(ls "$OUT"/export/*.ipa 2>/dev/null)"
fi
