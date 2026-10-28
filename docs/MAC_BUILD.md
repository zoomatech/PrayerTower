# One-command Mac build

`scripts/mac-build.sh` builds everything that needs Xcode and prints one pass/fail table. Run it on the Mac when Steve says "go".

```bash
cd /Users/Shared/GitHub/zoomatech/PrayerTower
git checkout main && git pull
scripts/mac-build.sh
```

## What it does

| Step | How | Signing |
|---|---|---|
| Install | `npm ci` at the repo root | none |
| Prebuild | `npx expo prebuild --platform ios --clean`, then `pod install` | none |
| iPhone app | `xcodebuild build` for `generic/platform=iOS Simulator` with `-sdk iphonesimulator` [1] | none (`CODE_SIGNING_ALLOWED=NO`) [1] |
| Widget | Checks that the "Pray now" widget extension (`PlugIns/*.appex`) is inside the built iPhone app. If prebuild made a separate widget scheme, it builds that too | none |
| Mac app | Builds the same iOS app for "My Mac (Designed for iPad)". The script reads the exact destination from `xcodebuild -showdestinations`, because its wording changes between Xcode versions [2] | Unsigned by default. Set `APPLE_TEAM_ID` to sign it so it can run |

There is no separate Mac app: the Mac runs the iOS app as "Designed for iPad" on Apple silicon ([MAC_AND_IPAD.md](MAC_AND_IPAD.md)).

## Options

- `APPLE_TEAM_ID=ABCDE12345 scripts/mac-build.sh` signs the Mac build with your team and lets Xcode create the profiles (`-allowProvisioningUpdates`). The Team ID is on developer.apple.com → Account → Membership.
- `scripts/mac-build.sh --skip-prebuild` reuses `apps/mobile/ios` as it is, for a quicker second run.

## The report

The table is printed at the end and saved as `build-logs/<time>/REPORT.txt`, with a log per step (`npm.log`, `prebuild.log`, `pods.log`, `iphone.log`, `mac.log`, `widget.log`). For any step that failed, the script prints the first `error:` lines. The exit code is 0 only when nothing failed. `build-logs/` is not committed.

## Needs

- A Mac with Apple silicon (the Mac step needs it), Xcode, Node.js and CocoaPods.
- Xcode opened once, and `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` if `xcodebuild` is missing.

This builds and checks the code. Sending a build to TestFlight is a separate step: see [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md).

## Sources

1. Codemagic, iOS simulator builds (unsigned `xcodebuild` with `-sdk iphonesimulator` and `CODE_SIGNING_ALLOWED=NO`): https://docs.codemagic.io/yaml-code-signing/ios-simulator-builds/
2. Apple Developer Forums, "xcodebuild keeps defaulting to Mac Catalyst" (the `variant:Designed for [iPad,iPhone]` destination as `xcodebuild` lists it): https://developer.apple.com/forums/thread/796553
