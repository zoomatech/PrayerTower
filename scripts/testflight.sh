#!/usr/bin/env bash
# One command to put the iPhone app on TestFlight (STEVE_TODO step A10).
# It reads the app's settings from deploy/production.env (the same file as
# scripts/go-live.sh), copies them to EAS, builds the iOS app in the cloud,
# sends it to TestFlight and uploads the App Store text. See
# docs/TESTFLIGHT_EAS_GUIDE.md.
#
#   scripts/testflight.sh            # check, then build and submit
#   scripts/testflight.sh --check    # only check settings and the Expo sign-in
#   ENV_FILE=deploy/other.env scripts/testflight.sh
#
# The first run asks you to sign in to Expo and to Apple, and lets EAS make the
# signing certificate. Later runs only ask what changed.
# The build and submit steps: https://docs.expo.dev/build/automate-submissions/
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
env_file=${ENV_FILE:-$root/deploy/production.env}
mode=${1:-all}
log() { printf '\n==> %s\n' "$*"; }
die() { printf 'testflight: %s\n' "$*" >&2; exit 1; }
eas() { npx --yes eas-cli@latest "$@"; }

[ -f "$env_file" ] || die "no $env_file (copy deploy/production.env.example)"
# NAME=value lines, read as plain text the way scripts/go-live.sh reads them.
while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
  name=${BASH_REMATCH[1]} value=${BASH_REMATCH[2]}
  [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]] && value=${BASH_REMATCH[1]}
  export "$name=$value"
done < "$env_file"

# The same defaults as scripts/go-live.sh.
export EXPO_PUBLIC_SUPPORT_EMAIL=${EXPO_PUBLIC_SUPPORT_EMAIL:-${SUPPORT_EMAIL:-}}
export EXPO_PUBLIC_CRISIS_COUNTRY=${EXPO_PUBLIC_CRISIS_COUNTRY:-${CRISIS_COUNTRY:-US}}
export EXPO_PUBLIC_SENTRY_DSN=${EXPO_PUBLIC_SENTRY_DSN:-${SENTRY_DSN:-}}
export EXPO_PUBLIC_LINK_URL=${EXPO_PUBLIC_LINK_URL:-${WEB_APP_URL:-}}
export EXPO_PUBLIC_TERMS_URL=${EXPO_PUBLIC_TERMS_URL:-${EXPO_PUBLIC_API_URL:-}/terms}

# 1. Settings.
log "Checking settings in $env_file"
required=(EXPO_PUBLIC_API_URL EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY EXPO_PUBLIC_PRIVACY_URL EXPO_PUBLIC_SUPPORT_EMAIL)
missing=()
for v in "${required[@]}"; do [ -n "${!v:-}" ] || missing+=("$v"); done
[ ${#missing[@]} = 0 ] || die "set these in $env_file: ${missing[*]} (EXPO_PUBLIC_SUPPORT_EMAIL can come from SUPPORT_EMAIL)"
case "$EXPO_PUBLIC_API_URL$EXPO_PUBLIC_SUPABASE_URL" in
  *'<'*|*127.0.0.1*|*localhost*) die "EXPO_PUBLIC_API_URL and EXPO_PUBLIC_SUPABASE_URL must be the real cloud values" ;;
esac
command -v npx >/dev/null || die "Node 22 is needed (npx not found)"
echo "Settings look right."

# 2. Expo account and project.
cd "$root/apps/mobile"
log "Checking the Expo sign-in"
if ! eas whoami >/dev/null 2>&1; then
  [ "$mode" = --check ] && die "not signed in to Expo: run this script without --check, or 'npx eas-cli login'"
  eas login
fi
echo "Signed in to Expo as $(eas whoami 2>/dev/null | head -1)."
if [ "$mode" = --check ]; then
  echo "Ready. Run scripts/testflight.sh to build and send to TestFlight."
  exit 0
fi
if ! grep -q '"projectId"' app.json && [ -z "${EAS_PROJECT_ID:-}" ]; then
  log "Linking the app to your Expo account (eas init, one time)"
  eas init
fi

# 3. The build's settings, fixed into the app at build time.
log "Copying the app's settings to EAS (production)"
for v in "${required[@]}" EXPO_PUBLIC_TERMS_URL EXPO_PUBLIC_CRISIS_COUNTRY EXPO_PUBLIC_LINK_URL EXPO_PUBLIC_SENTRY_DSN; do
  [ -n "${!v:-}" ] || continue
  # env:set creates the variable or updates it.
  eas env:set --name "$v" --value "${!v}" --environment production --visibility plaintext --non-interactive >/dev/null
  echo "  $v"
done

# 4. Build in the cloud and send to TestFlight.
log "Building the iPhone app and sending it to TestFlight (about 20-40 minutes)"
eas build --platform ios --profile production --auto-submit

# 5. The App Store text (docs/store/STORE_LISTING.md). Needs the app registered with Apple, which step 4 did.
log "Uploading the App Store text"
STORE_SITE_URL=${STORE_SITE_URL:-${EXPO_PUBLIC_API_URL%/}} eas metadata:push \
  || echo "The App Store text didn't upload yet. Apple may still be processing the build; run 'cd apps/mobile && npx eas-cli metadata:push' in an hour."

cat <<EOF

Done. In App Store Connect → your app → TestFlight:
  1. Test Information: paste the text from docs/store/TESTFLIGHT_TEST_INFO.md.
  2. External Testing → add a group → add this build → Public Link → turn it on.
  3. Put the link in $env_file as TESTFLIGHT_URL=https://testflight.apple.com/join/… and run scripts/go-live.sh,
     so invite emails tell iPhone users to install TestFlight and open the link.
EOF
