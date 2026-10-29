# Native Swift port plan

Steve's rule (2026-10-28): the pilot stays the Expo app in `apps/mobile`. Every future app, including the later Prayer Tower iPhone app, is native Swift. This is the plan for that app, plus the groundwork already in `apps/ios-native`.

## What stays the same

- **The server.** The native app calls the same API (`apps/server`) with the same Supabase sign-in token. No server changes are needed to port a screen. Every route and error shape is in [API.md](API.md).
- **Supabase Auth.** Sign-in, two-step codes and sessions go through [supabase-swift](https://github.com/supabase/supabase-swift), the official Swift client ([install guide](https://supabase.com/docs/reference/swift/installing)). Members keep their accounts; nothing migrates.
- **Admin switches.** The app reads `GET /features` and hides anything switched off, just like the Expo app. A missing key counts as off (`Features` in `PrayerTowerKit`).
- **Wording.** Open Circle communities get plain wording. The native app takes the same word list from `apps/mobile/src/locales/neutral.ts`, ported to a `.xcstrings` catalog when the screens are built.

## What is in `apps/ios-native` now

| Part | What it does | Runs on Linux CI |
| --- | --- | --- |
| `PrayerTowerKit` | API models, requests, errors (`APIError` reads `{error, message}`, `needsCode`, `signedOut`) | Yes |
| `PrayerTowerSession` | Supabase sign-in, two-step code, sign-out; `SignInState` | Yes |
| `App/` | SwiftUI: sign in, two-step code, the feed with one row of action icons, the kind cloud, prayer circles (with welcome and updates), and fresh-start days on Me | No (needs a Mac) |
| `project.yml` | [XcodeGen](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md) spec; bundle id `com.zoomatech.prayertower.native` | — |

Tests: five API tests with a stubbed network, and two live tests (sign-in, feed, Praying Now, wrong password) that run when `PT_*` variables point at a running stack. CI runs `swift test` in the official `swift:6.4.1-noble` image ([swift.org Linux install](https://www.swift.org/install/linux/)).

The app uses the `@Observable` macro rather than `ObservableObject`, as Apple now recommends ([migration guide](https://developer.apple.com/documentation/swiftui/migrating-from-the-observable-object-protocol-to-the-observable-macro)). Sessions are kept in the Keychain (`KeychainLocalStorage` from supabase-swift).

## Kindness screens (phase 1b)

Each one reads the same admin switch as the Expo app and shows nothing while it is off.

| Screen | Switch (`/features`) | Shared code |
| --- | --- | --- |
| One row of six action icons; a long press shows the name, and with meanings on, the emoji's meanings to choose | `meaningReactions` + `meaningIconRow` for meanings | `ActionRow`, `CardAction`, `MeaningEmoji` |
| Kind cloud under every text box (encourage, circle posts, replies, updates), checked 700 ms after typing stops, never blocking | `kindCloud` | `KindCloud`, `Precheck` |
| Prayer circles: start, join with a code, share, pray, reply, invite | `prayerCircles` | `CircleView`, `CirclePost` |
| Circle welcome and circle updates ("How it's going", answered) | `circleWelcome`, `circleUpdates` (both need circles) | `CirclePost.Update` |
| Fresh-start days on Me: up to three dates, and today's fresh start | `freshDays` | `FreshDayRules`, `FreshDay` |

Commit to Pray and Gift Tokens keep their icons in the row, and for now say they are coming soon (phases 2 and 4). Open Circle wording comes from the same words as `neutral.ts`, and a test checks the kind cloud has no religious words there.

## Port order

Each phase ships to TestFlight under the separate bundle id. The Expo app stays the one members use until the last phase.

1. **Sign in and the feed** (groundwork done). Add pull-to-refresh, paging and the six reaction icons in one row.
2. **Post a request, pray, and Me.** Compose, prayer list, profile, notification settings, delete account, data download.
3. **Push and widgets.** APNs directly (the server sends through Expo today, so it gains a direct APNs sender for native tokens), the Pray now widget and the Lock Screen Live Activity in WidgetKit, which become simpler natively.
4. **Groups, events, conversations, giving, tokens.** One module per screen group, in the order members use them in the pilot results.
5. **Staff and admin.** Moderation, audit log, radio admin, admin switches.
6. **Skins.** Vine, Golden Wood, neon and the rest, drawn with SwiftUI `Canvas` and shaders instead of SVG.
7. **Cutover.** Ship under `com.zoomatech.prayertower` as a new version of the same App Store listing, so members update instead of reinstalling. Retire `apps/mobile`.

## Native-only gains

- **Passkeys.** The server-side switch already exists (`passkeys_enabled`). Natively, use `ASAuthorizationPlatformPublicKeyCredentialProvider` with an associated domain ([Apple: Supporting passkeys](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys)). The hosted Supabase project needs its RP ID set to the real domain.
- **Accessibility.** VoiceOver, Dynamic Type and Reduce Motion come from SwiftUI defaults instead of being added by hand.
- **Mac and iPad.** The same SwiftUI target can run on iPad and Mac, replacing the separate menu bar module later.

## Building on Steve's Mac

Mac builds run through Remote Control, as with `scripts/mac-build.sh`. The native app needs Xcode and `brew install xcodegen`; it does not need CocoaPods (packages come from Swift Package Manager). Steps are in [apps/ios-native/README.md](../apps/ios-native/README.md).

`scripts/mac-build-native.sh` does it in one go: it runs `swift test`, installs XcodeGen with Homebrew if it's missing, generates the project, builds the app for the iOS Simulator without signing, and prints a pass/fail table with logs in `build-logs/native-<time>/`.

## Not done yet

- No screens beyond sign-in, the feed, circles and fresh-start days on Me.
- No App Store listing or TestFlight build for the native bundle id.
- The `App/` target has only been type-checked through its shared code on Linux; its first full build happens on the Mac.
