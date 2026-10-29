# Native apps on TestFlight

The native SwiftUI apps in `apps/ios-native` (Prayer Tower and Open Circle), with their widgets and
Safari cross-posting extensions, go to TestFlight with one headless command on the Mac. No Xcode
window or Simulator opens. The Expo pilot app keeps its own path ([TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md)).

## What each build carries

| Target | Bundle ID | App group | Privacy manifest |
| --- | --- | --- | --- |
| PrayerTowerNative (app) | `com.zoomatech.prayertower.native` | `group.com.zoomatech.prayertower.native` | `App/PrivacyInfo.xcprivacy` |
| PrayerTowerWidgets (Pray now, Live Activity) | `com.zoomatech.prayertower.native.widgets` | same | `Widgets/PrivacyInfo.xcprivacy` |
| PrayerTowerCrosspost (Safari extension) | `com.zoomatech.prayertower.native.crosspost` | none | `Crosspost/PrivacyInfo.xcprivacy` |
| OpenCircleNative (app) | `com.zoomatech.opencircle.native` | `group.com.zoomatech.opencircle.native` | `App/PrivacyInfo.xcprivacy` |
| OpenCircleWidgets | `com.zoomatech.opencircle.native.widgets` | same | `Widgets/PrivacyInfo.xcprivacy` |
| OpenCircleCrosspost | `com.zoomatech.opencircle.native.crosspost` | none | `Crosspost/PrivacyInfo.xcprivacy` |
| PrayerTowerConsole (Mac) | `com.zoomatech.prayertower.console` | none | `Console/PrivacyInfo.xcprivacy` |

- **Privacy manifests:** no tracking and no tracking domains. The only required-reason API is
  UserDefaults: `CA92.1` for the app's own settings and `1C8F.1` for the app group the widget
  reads ([Apple: Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)).
  The collected data types follow [store/APP_PRIVACY_ANSWERS.md](store/APP_PRIVACY_ANSWERS.md).
  After an archive, Xcode's Organizer can make a privacy report from them
  ([Apple: Describing data use in privacy manifests](https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests)).
- **Encryption:** `ITSAppUsesNonExemptEncryption` is false in both apps (only the system's HTTPS), so
  TestFlight doesn't ask the export question on each build.
- **Entitlements:** each app and its widget share their edition's app group. Both apps have
  `aps-environment`, because Live Activity updates arrive by push (`pushType: .token`). Export
  switches it to production. Passkeys use `webcredentials:$(PT_PASSKEY_DOMAIN)`.
- **Version and build:** every target in an archive gets the same `MARKETING_VERSION` (`PT_VERSION`,
  default 0.1.0) and `CURRENT_PROJECT_VERSION` (`PT_BUILD`, default a count of seconds since
  2026-01-01, so each build is higher than the last). App Store Connect needs the app and its
  extensions to match.

## The command

Fill in `apps/ios-native/Config.xcconfig` first (copied from `Config.example.xcconfig`): the server
settings, `PT_TEAM_ID`, and either an App Store Connect API key (`ASC_KEY_PATH`, `ASC_KEY_ID`,
`ASC_ISSUER_ID`) or your Apple ID signed in to Xcode once.

```bash
scripts/mac-archive-native.sh                # Prayer Tower: archive and export an .ipa
UPLOAD=1 scripts/mac-archive-native.sh       # archive and upload to App Store Connect
UPLOAD=1 scripts/mac-archive-native.sh opencircle
```

The script prepares the project the same way as `scripts/mac-build-native.sh`, then runs
`xcodebuild archive` for `generic/platform=iOS` with automatic signing and
`-allowProvisioningUpdates`, so Xcode makes the certificates, app IDs and profiles. Then it runs
`xcodebuild -exportArchive` with `method` `app-store-connect` and `destination` `export` or `upload`.
These are the options listed by `xcodebuild -help` in Xcode 27.1. Output and logs go to
`build/native-archive/<edition>-<build>/`.

## Before the first upload (Steve's Apple account)

These steps are in STEVE_TODO.md:

1. Apple Developer Program membership (Part A step 1).
2. The Team ID (Membership details), pasted as `PT_TEAM_ID`.
3. An App Store Connect API key with the App Manager role (Users and Access → Integrations), saved
   outside the repository. Its path, key ID and issuer ID go in `Config.xcconfig`. The other way is
   to sign in to Xcode once (Settings → Accounts).
4. An app record in App Store Connect for each edition to upload, with the bundle ID above.
   Automatic signing registers the app IDs and app groups on the first archive.
5. The listing text, privacy answers and TestFlight text in `docs/store/` (they apply to the
   native builds as they are; see "Native builds" in STORE_LISTING.md).

## iPad and Mac

Both apps run on iPad (`TARGETED_DEVICE_FAMILY` 1,2, all orientations). On iPad in a regular-width
window the tabs become a sidebar in a split view, the feed becomes a multi-column grid with pointer
hover, and ⌘1–⌘6 switch sections, ⌘N writes a post and ⌘R refreshes. PrayerTowerMac
(`com.zoomatech.prayertower.mac`) is the member app for the Mac, built from the same SwiftUI code
(not the operator console). `scripts/mac-build-native.sh` builds it headless.

## Store screenshots

```bash
scripts/mac-screenshots-native.sh               # Prayer Tower
scripts/mac-screenshots-native.sh opencircle
```

The script makes a temporary iPhone Pro Max and iPad Pro 13-inch Simulator, boots it in the
background (no Simulator window), sets the status bar to 9:41 with full bars, and launches the app
with its sample data (`-PTSampleData -PTScreen feed|post|promises|messages|notices|me`). It saves
each screen with `xcrun simctl io … screenshot` to `store-screenshots/native/<edition>/<device>/`,
then deletes the Simulators. It needs an iOS Simulator runtime (`xcodebuild -downloadPlatform iOS`).
