# Swift parity checklist

Every screen (route) in the Expo app (`apps/mobile/src/app`) and its native SwiftUI version
(`apps/ios-native/App`). Updated 2026-10-29.

- ✅ ported: a native screen does the same job.
- 📻 radio thread and 💛 kindness thread: owned by those threads, not ported here.
- Switches: a native screen shows only when the same admin switch (`features`) or community
  setting is on, as in Expo.

## Tabs

| Expo route | Native | Status |
| --- | --- | --- |
| `(tabs)/index` (feed) | `FeedView`, `CardRow`, skins in `Skins/` | ✅ (offline copy and queued "Praying Now" in #204) |
| `(tabs)/commitments` | `CommitmentsView` | ✅ |
| `(tabs)/messages` | `MessagesView` | ✅ |
| `(tabs)/notifications` | `NotificationsView` | ✅ |
| `(tabs)/profile` | `MeView` | ✅ |

## Member screens

| Expo route | Native | Status |
| --- | --- | --- |
| `sign-in` (invite sign-up, Open Circle face) | `SignInView`, `LegalLinksView` | ✅ |
| `onboarding` | `OnboardingView` | ✅ |
| `tour` | `TourView` | ✅ |
| `two-step` | `SignInSecurityView`, `TwoStepSection` | ✅ |
| `account-security` | `AccountSecurityView` | ✅ |
| `delete-account` | `DeleteAccountView` | ✅ (also clears the offline copy) |
| Data export (Me → Export) | `MeView` export, `ExportFile` share | ✅ |
| `compose` | `ComposeView` | ✅ |
| `post/[id]` | `PostDetailView` | ✅ |
| Share sheet (feed note, ask to pray, share outside) | `ShareSheet`, `OutsideShareRow` | ✅ |
| Share choice (sharing by consent) | `ShareChoiceSection` | ✅ |
| Guest prayer link and prayer chain send | `GuestShareSection` | ✅ |
| Comment share | `PostDetailView` comment row | ✅ |
| Answered-prayer stories | `AnsweredStorySection`, `StoryLinks` | ✅ |
| Power prayer | `PowerPrayerSection` | ✅ |
| `conversation/[id]` | `MessagesView` conversation | ✅ |
| `people/[id]` | `PersonView` | ✅ |
| `circles/index`, `circles/[id]` | `CirclesView`, `CircleDetailView` | ✅ |
| `groups` | `GroupsView` | ✅ |
| `events`, `event/[id]` | `EventsView`, `EventDetailView` | ✅ |
| `care` | `CareView` | ✅ |
| `appeal/[id]` | `AppealView` | ✅ |
| `notification-settings` | `NotificationSettingsView` | ✅ |
| `rules` | `RulesView` | ✅ |
| `safety` (safety center) | `SafetyCenterView` | ✅ |
| `feedback` | `FeedbackView` | ✅ |
| `scheduled` (scheduled gifts) | `ScheduledGiftsView` | ✅ |
| `give` | `GiveView` | ✅ (radio allowance part is 📻) |
| `why-gifts` | `WhyGiftsView` | ✅ |
| `pools` | `PoolsView`, `NewPoolSheet` | ✅ |
| `macro-needs` | `MacroNeedsView` | ✅ |
| `prayer-list` | `PrayerListView` | ✅ |
| `prayer-minute` | `PrayerMinuteView` | ✅ |
| `prayer-chain` | `PrayerChainView` | ✅ |
| `prayer-cast` (cast and mix) | `PrayerCastView` | ✅ |
| `highlights` | `HighlightsView` | ✅ |
| `remembered` | `RememberedView` | ✅ |
| `help-stories` | `HelpStoriesView` | ✅ |
| `awards` | `AwardHallView` | ✅ |
| `branch` | `BranchView` | ✅ |
| `squire-board` | `SquireBoardView` | ✅ |
| `podcasts` | `PodcastsView` | ✅ |
| `live` | `LiveView`, `LiveFollowView` | ✅ |
| `reading-plan` | `ReadingPlanView` | ✅ |
| `church` | `ChurchView` | ✅ |
| `witness` | `WitnessView` | ✅ |
| `survey/[id]` | `SurveyView`, `SurveyPrompts` in the feed | ✅ |
| `ai-chat` | `AiChatView`, `AiTurnsView` | ✅ |
| `circle-prep` | `CirclePrepView` | ✅ |
| `crosspost` | `CrosspostView` | ✅ |
| `library` (Bible and ancient writings search) | `LibraryView`, admin switch in `LibraryAdminSection` | ✅ |
| `token-store` | `TokenStoreView` (StoreKit 2, practice mode) | ✅ |
| `+not-found` | `RouteView` | ✅ |

## Staff and admin screens

| Expo route | Native | Status |
| --- | --- | --- |
| `moderation` | `ModerationView` | ✅ |
| `admin` (metrics, pilot report, tokens, new members, tiers, milestones, people and roles) | `AdminHubView` | ✅ |
| `admin` settings sections (switches and numbers) | `AdminBoardsView`, generated `admin-boards.json` | ✅ |
| `announcements` | `AnnouncementsAdminView` | ✅ |
| `invites` | `InvitesView` | ✅ |
| `import` | `ImportView` | ✅ |
| `audit-log` | `AuditLogView` | ✅ |
| `error-log` | `ErrorLogView` | ✅ |
| `feedback-triage` | `FeedbackTriageView` | ✅ |
| `ops` | `OpsView` | ✅ |
| `surveys` | `SurveysAdminView` | ✅ |
| `legal` | `LegalCasesView` | ✅ |
| `podcasts-admin` | `PodcastsAdminView` | ✅ |
| `churches` | `ChurchReviewView` | ✅ |
| `waitlist` | `WaitlistView` | ✅ |

## Owned by other threads

| Expo route | Status |
| --- | --- |
| `listen`, `listen-on-air`, `operator-console`, `radio-requests`, `signal-queue`, amplify / radio send | 📻 radio thread (`RadioViews.swift`, `PrayerTowerConsole`) |
| Admin → Radio: radio settings, burst size, listen page, receipts, on-air page, Priestly fund settings, station health and acks, station alerts, listener and station nodes with SNR, recent bursts, and the radio switches (heard trail, scheduled radio, signal queue, operator console, fair air, ceaseless, beacon, sky, schedule, operator log, followups, listener mode, packet, digest) | 📻 radio thread |
| `kindness-research`, `meaning-words`, `mend/[id]`, `skin-gallery`, `skin-idea`, kind norms, kindness weather | 💛 kindness thread (`Skins/`, `KindCloudView`) |

## Editions

| Edition | Native target | Status |
| --- | --- | --- |
| Prayer Tower | `PrayerTowerNative` (`com.zoomatech.prayertower.native`, `prayertower://`) | ✅ |
| Open Circle | `OpenCircleNative` (`com.zoomatech.opencircle.native`, `opencircle://`, neutral words) | ✅ |

## Feed skins, widgets and extensions

| Expo piece | Native | Status |
| --- | --- | --- |
| Feed layouts: vine, wall, tower, circuit, carousel, flip, column (`src/layouts/`) | `Skins/SkinnedFeed.swift`, `Skins/DeckFeeds.swift` | ✅ |
| Looks: beanstalk, Golden Wood ink, neon tube light, gate, floral, plain; one row of 6 reaction icons | `Skins/`, `ActionRowView` | ✅ |
| Theme maker and skin gallery | `ThemeMakerView`, `SkinGalleryView` | ✅ (💛 kindness thread) |
| Pray now widget | `PrayerTowerWidgets`, `OpenCircleWidgets` | ✅ |
| Prayed-for Lock Screen Live Activity | `PrayedForLiveActivity` in both widget targets | ✅ |
| Cross-posting browser extension (Safari on iPhone and iPad) | `PrayerTowerCrosspost`, `OpenCircleCrosspost` app extensions, embedded in each app | ✅ |
| iPad (native only): sidebar split view, multi-column feed, ⌘1–⌘6 / ⌘N / ⌘R, pointer hover | `MainTabs`, `FeedView` grid, `App/Platform.swift` | ✅ |
| Mac member app (native only, separate from the operator console) | `PrayerTowerMac` target, same `App/` SwiftUI code | ✅ |

## Known gaps

- A few admin settings that are not plain switches or number fields are only in the Expo admin
  screen: the care confession-days number, and the giving split and live sections' extra fields.

## How it is checked

- Linux: `swift test` in `apps/ios-native` (PrayerTowerKit models, API paths, words, offline queue).
- Mac, headless only: `scripts/mac-build-native.sh` runs the Kit tests, builds both apps with
  their widgets and Safari extensions, the Mac member app and the Mac console, and runs the UI
  walks. No windows open.
- Store screenshots: the "Native screenshots" GitHub workflow runs `scripts/mac-screenshots-native.sh`
  on GitHub's macOS runner (iPhone Pro Max and iPad Pro 13-inch, sample data) and keeps the pictures
  as a build artifact, so nothing needs a Simulator on a member's Mac.
- UI walks (`apps/ios-native/UIWalks`): XCUITest on the Simulator with `-PTSampleData`, which
  signs in a sample member and answers every API call on the device (`SampleServer`), so no
  server or account is needed. They open the feed, a request with its comments, My Promises,
  Messages, Notices and Me.

## Native only: Siri and Spotlight

Behind one switch on the device, Me → Siri and Spotlight, off by default (`Shortcuts.defaultsKey`):

- **Siri Shortcuts** (`App/Shortcuts.swift`, App Intents): "Pray for…" marks the member praying now
  for a request Siri offers from their feed (never their own, sensitive or crisis requests), and
  "Open prayer list" opens the prayer list, or My Promises when the list is switched off.
- **Spotlight:** the member's own requests (never sensitive or crisis ones) are indexed on the
  device as the feed loads. A tap opens the request. Turning the switch off removes them.
