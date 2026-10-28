#!/usr/bin/env bash
# One command on Steve's Mac: prebuild the iOS project, then build
#   1. the iPhone app (iOS Simulator, no signing needed),
#   2. the Mac app ("Designed for iPad" on Apple silicon),
#   3. the "Pray now" widget extension,
# and print a pass/fail table. Logs go to build-logs/<time>/.
#
#   scripts/mac-build.sh                 # everything
#   APPLE_TEAM_ID=ABCDE12345 scripts/mac-build.sh   # sign the Mac build with your team
#   scripts/mac-build.sh --skip-prebuild # reuse apps/mobile/ios as it is
#
# See docs/MAC_BUILD.md.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/apps/mobile"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOGS="$ROOT/build-logs/$STAMP"
DERIVED="$ROOT/build-logs/derived"
SKIP_PREBUILD=0
for a in "$@"; do
  case "$a" in
    --skip-prebuild) SKIP_PREBUILD=1 ;;
    -h|--help) sed -n 2,13p "$0"; exit 0 ;;
    *) echo "Unknown option: $a"; exit 2 ;;
  esac
done
mkdir -p "$LOGS"

RESULTS=()
FAILED=0
record() { RESULTS+=("$(printf '%-22s %-6s %s' "$1" "$2" "$3")"); [ "$2" = FAIL ] && FAILED=1; return 0; }

# --- Checks -------------------------------------------------------------------
if [ "$(uname)" != Darwin ]; then echo "This script runs on a Mac with Xcode."; exit 2; fi
if ! xcodebuild -version > "$LOGS/xcode-version.txt" 2>&1; then
  echo "xcodebuild not found. Install Xcode from the App Store, open it once, then run:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 2
fi
record "Xcode" ok "$(head -1 "$LOGS/xcode-version.txt")"
command -v node >/dev/null || { echo "Node.js is missing (https://nodejs.org)."; exit 2; }
command -v pod >/dev/null || echo "Note: CocoaPods not found; expo prebuild installs pods only if it is (https://cocoapods.org)."

# --- Install and prebuild -------------------------------------------------------
cd "$ROOT"
echo "== npm ci (log: $LOGS/npm.log)"
if npm ci > "$LOGS/npm.log" 2>&1; then record "Install packages" ok "npm ci"; else record "Install packages" FAIL "see npm.log"; fi

cd "$MOBILE"
if [ "$SKIP_PREBUILD" = 0 ]; then
  echo "== expo prebuild (log: $LOGS/prebuild.log)"
  if npx expo prebuild --platform ios --clean --no-install > "$LOGS/prebuild.log" 2>&1 \
     && (cd ios && pod install > "$LOGS/pods.log" 2>&1); then
    record "Prebuild + pods" ok "apps/mobile/ios"
  else
    record "Prebuild + pods" FAIL "see prebuild.log / pods.log"
  fi
fi

WS="$(ls -d ios/*.xcworkspace 2>/dev/null | head -1)"
if [ -z "$WS" ]; then
  record "Workspace" FAIL "no ios/*.xcworkspace"
  printf '\n%s\n' "${RESULTS[@]}"; exit 1
fi
xcodebuild -list -json -workspace "$WS" > "$LOGS/schemes.json" 2>/dev/null
APP_SCHEME="$(basename "$WS" .xcworkspace)"
WIDGET_SCHEME="$(node -e 'const j=require(process.argv[1]);const s=(j.workspace||{}).schemes||[];const w=s.find(x=>/widget/i.test(x));if(w)console.log(w)' "$LOGS/schemes.json" 2>/dev/null)"

# --- 1. iPhone app (simulator, unsigned) ------------------------------------------
echo "== iPhone app (log: $LOGS/iphone.log)"
if xcodebuild build -workspace "$WS" -scheme "$APP_SCHEME" -configuration Debug \
     -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
     -derivedDataPath "$DERIVED/iphone" CODE_SIGNING_ALLOWED=NO > "$LOGS/iphone.log" 2>&1; then
  APP="$(ls -d "$DERIVED"/iphone/Build/Products/Debug-iphonesimulator/*.app 2>/dev/null | head -1)"
  record "iPhone app" ok "$(basename "${APP:-?}")"
  # 3a. The widget is embedded in the app as an extension; check that it is there.
  APPEX="$(ls -d "$APP"/PlugIns/*.appex 2>/dev/null | head -1)"
  if [ -n "$APPEX" ]; then record "Widget (in iPhone app)" ok "$(basename "$APPEX")"; else record "Widget (in iPhone app)" FAIL "no PlugIns/*.appex"; fi
else
  record "iPhone app" FAIL "see iphone.log"
fi

# --- 2. Mac app ("Designed for iPad") ---------------------------------------------
# The exact destination text varies by Xcode version, so read it from Xcode.
xcodebuild -showdestinations -workspace "$WS" -scheme "$APP_SCHEME" > "$LOGS/destinations.txt" 2>&1
MAC_DEST="$(grep -o '{ platform:macOS[^}]*variant:Designed for[^}]*}' "$LOGS/destinations.txt" | head -1)"
echo "== Mac app (log: $LOGS/mac.log)"
if [ -z "$MAC_DEST" ]; then
  record "Mac app" FAIL "Xcode lists no 'Designed for iPad' Mac (needs Apple silicon); see destinations.txt"
else
  MAC_ID="$(printf '%s' "$MAC_DEST" | sed -n 's/.*id:\([^,}]*\).*/\1/p' | tr -d ' ')"
  SIGN=(CODE_SIGNING_ALLOWED=NO)
  [ -n "${APPLE_TEAM_ID:-}" ] && SIGN=(DEVELOPMENT_TEAM="$APPLE_TEAM_ID" -allowProvisioningUpdates)
  if xcodebuild build -workspace "$WS" -scheme "$APP_SCHEME" -configuration Debug \
       -destination "id=$MAC_ID" -derivedDataPath "$DERIVED/mac" "${SIGN[@]}" > "$LOGS/mac.log" 2>&1; then
    if [ -n "${APPLE_TEAM_ID:-}" ]; then record "Mac app" ok "signed with team $APPLE_TEAM_ID"; else record "Mac app" ok "unsigned (set APPLE_TEAM_ID to run it)"; fi
  else
    record "Mac app" FAIL "see mac.log"
  fi
fi

# --- 3b. Widget extension on its own ---------------------------------------------
if [ -n "$WIDGET_SCHEME" ]; then
  echo "== Widget scheme $WIDGET_SCHEME (log: $LOGS/widget.log)"
  if xcodebuild build -workspace "$WS" -scheme "$WIDGET_SCHEME" -configuration Debug \
       -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
       -derivedDataPath "$DERIVED/widget" CODE_SIGNING_ALLOWED=NO > "$LOGS/widget.log" 2>&1; then
    record "Widget scheme" ok "$WIDGET_SCHEME"
  else
    record "Widget scheme" FAIL "see widget.log"
  fi
else
  record "Widget scheme" skip "no separate scheme; built inside the iPhone app"
fi

# --- Report ----------------------------------------------------------------------
{
  echo "Prayer Tower Mac build, $STAMP"
  echo "Commit: $(git -C "$ROOT" rev-parse --short HEAD) on $(git -C "$ROOT" rev-parse --abbrev-ref HEAD)"
  echo
  printf '%s\n' "${RESULTS[@]}"
  echo
  echo "Logs: $LOGS"
} | tee "$LOGS/REPORT.txt"
# Show the first errors of anything that failed.
for f in "$LOGS"/*.log; do
  if grep -q -E 'error:|\*\* BUILD FAILED' "$f"; then
    echo; echo "--- first errors in $(basename "$f")"; grep -m 10 -E 'error:' "$f"
  fi
done
exit "$FAILED"
