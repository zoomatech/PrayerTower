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
| `listen`, `listen-on-air`, `operator-console`, `radio-requests`, `signal-queue`, amplify / radio send, admin radio sections | 📻 radio thread (`RadioViews.swift`, `PrayerTowerConsole`) |
| `kindness-research`, `meaning-words`, `mend/[id]`, `skin-gallery`, `skin-idea`, kind norms, kindness weather | 💛 kindness thread (`Skins/`, `KindCloudView`) |

## Editions

| Edition | Native target | Status |
| --- | --- | --- |
| Prayer Tower | `PrayerTowerNative` (`com.zoomatech.prayertower.native`, `prayertower://`) | ✅ |
| Open Circle | `OpenCircleNative` (`com.zoomatech.opencircle.native`, `opencircle://`, neutral words) | ✅ (no widgets yet) |

## Known gaps

- Open Circle has no Home Screen widget target yet.
- A few admin settings that are not plain switches or number fields are only in the Expo admin
  screen: the care confession-days number, and the giving split and live sections' extra fields.

## How it is checked

- Linux: `swift test` in `apps/ios-native` (PrayerTowerKit models, API paths, words, offline queue).
- Mac, headless only: `scripts/mac-build-native.sh` builds both apps and runs the Kit tests with
  no windows opened.
