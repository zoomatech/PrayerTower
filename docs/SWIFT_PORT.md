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
| `Console/` | The Mac operator console app (macOS 15): operator console, station health, keying controls with their safety rules, Station menu and menu bar item; see [STATION_OPERATOR_GUIDE.md](STATION_OPERATOR_GUIDE.md#on-a-mac-prayer-tower-console) | No (needs a Mac) |
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
| "Your prayer life" on Me, with gentle rhythm, weeks of prayer, welcome back, fresh starts and the weekly intention (1 to 6 days, or no aim) | `gentleRhythm`, `gentleStreak`, `weeklyIntention` | `PrayerStats`, `PrayerLifeSection` |
| Three good things on Me: up to three a week, a reminder day, share as praise or to a circle | `gratitudeCard` (`circleUpdates` for circles) | `Gratitude`, `GratitudeSection` |
| Kind words practice on Me: a made-up moment each week, three replies, and how each might land; nothing leaves the phone | `empathyPractice` | `KindWords`, `KindWordsSection` |
| Encourager on Me: ask for a welcoming volunteer or volunteer, end a match with one tap, and the one-time "How is it going?" | `encourager`, `encouragerCheckin` | `EncouragerState`, `EncouragerSection` |
| "Share how it's going?" on the author's own post, once, with "Prefer not to say" | `followupNudge` | `FollowupAnswer`, `FollowupSection` |
| Who can reply: the author picks everyone, people who prayed, or no comments; others see a gentle note instead of the box | `replyChoice` | `ReplyChoiceState` |
| Answered marks: a gold "Answered" mark on the card, and links between a request and its answered-prayer story | `answeredStories` for the links | `Card.isAnswered`, `StoryLink` |
| Admin → Kindness (admins only): the kindness starter set in one tap, and the weekly kindness weather from totals | `kindness_weather_enabled` for the weather | `KindnessStarter`, `WeatherWeek`, `AdminKindnessView` |

Commit to Pray and Gift Tokens keep their icons in the row, and for now say they are coming soon (phases 2 and 4). Open Circle wording comes from the same words as `neutral.ts`, and a test checks the kind cloud has no religious words there.

## Feed skins (phase 6, started)

The native feed reads the member's skin from `GET /feed` (`theme`) and draws it in SwiftUI (`App/Skins/`). Me → Feed style lists the skins the community offers (`GET /me/feed-themes`, `PUT /me/feed-theme`), so the server's skins switch still decides what shows.

- **Shared code** (`Skins.swift`, tested on Linux): `VineLook`, `TowerLook`, `CircuitLook` and `WallLook` read the same tokens with the same defaults and limits as the Expo layouts (stem width 2 to 14, tilt 0 to 20, known leaf shapes and drawing styles only). The leaf box and the tablet face use the same 4.5:1 rule as `leafBox()` and `tabletFace()`. The tests check the native colors against the Expo app's own output.
- **Vine** (Beanstalk, Golden Wood, Moonlit Gate, Neon Cinderella, Blossom Garden and the seasonal skins): one stalk down the left edge drawn with `Canvas`, each post housed in a drawn leaf with veins, its newest comments on smaller leaves (`Card.leafComments`). The `vineStyle` token picks twisting strands, pen and ink, neon rods with a running spark, lines of silver light under a drawn gate, or a climbing rose with petal frames.
- **Wall**: one post per screen with a hard snap (`scrollTargetBehavior(.paging)`).
- **Prayer Tower / Climbing Tower**: stone walls, battlements, tablets and hanging sub-tablets, and a climber on a rope who rises as the member reads down.
- **Neon Circuit**: tilted glowing screens and a live wire with bursts of light.
- **Swipe to pray**: one card at a time; a swipe right or the Pray button asks before it prays, so a swipe never records a prayer by itself. Next, Pray and VoiceOver actions do the same without a swipe.
- **Flip**: one request per page, turned with a fold (`scrollTransition`), with "1 of 12" and the last page's thank-you.
- Neon Cinderella's castle, pumpkin coach, midnight clock and glass slipper are the Expo app's own drawings: the same SVG path data (`NeonArt.swift`), each line stroked as a glowing tube with a white-hot core.
- **Make your own feed skin** (Me, behind the `themeProposals` switch): layout, colors with a color picker, drawing style, comment shape and stem, with a live preview drawn by the real feed skins (`SkinMaker`, `ThemeMakerView`). The skin is the member's in Feed style at once; others get it once an admin approves it.
- **Skin gallery** (Me, behind the `skinGallery` switch): every skin the member can use, with a preview, who made it, likes and "Use this skin"; built-in names follow Open Circle wording (`GallerySkin`, `SkinGalleryView`).
- Every drawing is hidden from VoiceOver, and the spark, bursts and climber stop with Reduce Motion.

## Accessibility

- **Contrast:** text drawn straight on a skin's backdrop picks light or dark text by contrast, and gets a plate when neither reaches 7:1 (`BackdropText`), so any color a member picks in the theme maker stays readable. Leaf boxes and tablet faces keep 4.5:1 for any colors; tests sweep the whole color range.
- **Dynamic Type:** text uses text styles everywhere, widgets and the Live Activity included. At the accessibility sizes, rows of buttons and counts stack one under another instead of shrinking (`AdaptiveStack`).
- **Tap targets:** small text buttons and the compose swatches have 44 by 44 pt tap areas (`tapTarget()`).
- **VoiceOver:** every drawing is hidden; icons are labeled; rows that open a post are real buttons.
- **Reduce Motion:** the spark, bursts, climber, swipe tilt and page fold stop.

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

`scripts/mac-build-native.sh` does it in one go: it runs `swift test`, gets XcodeGen (from Homebrew, or built from its tagged source when Homebrew belongs to another macOS account), generates the project, builds the app for the iOS Simulator and the Mac operator console without signing, and prints a pass/fail table with logs in `build-logs/native-<time>/`.

## Not done yet

- No screens beyond sign-in, the feed, circles and fresh-start days on Me.
- No App Store listing or TestFlight build for the native bundle id.
- The `App/` target has only been type-checked through its shared code on Linux; its first full build happens on the Mac.
