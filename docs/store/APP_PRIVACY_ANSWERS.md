# App Store privacy label answers

The Google Play Data safety answers are archived in [archive/GOOGLE_PLAY_DRAFTS.md](../archive/GOOGLE_PLAY_DRAFTS.md); the pilot is iPhone only.

> Drafted 2026-10-28 from the code in PR #4, and rechecked the same day in the privacy audit ([PRIVACY_AUDIT.md](../PRIVACY_AUDIT.md)). **Check again before each submission** if a feature, SDK or server integration changes. Have counsel review these together with the privacy policy draft (`docs/legal/PRIVACY_POLICY_DRAFT.md`). The stores hold the developer responsible for accurate answers.

## What the app actually does with data (from the code)

| Source | Data | Where it goes |
|---|---|---|
| Sign-up | Email, password (hashed by Supabase Auth), display name | Supabase |
| Profile | Handle, bio, why here, support wanted or offered, preferences | Supabase |
| Posts | Request, praise and testimony text; kind and urgency; photos and videos | Supabase DB and private storage |
| Social | Comments, encouragements, thanks, follows, blocks, hidden posts | Supabase |
| Messaging | Prayer-thread, direct, group and care messages | Supabase |
| Events | Title, description, place (typed), video link, RSVPs | Supabase |
| Activity | Prayer taps, commitments, check-ins, prompt answers, token ledger | Supabase |
| Device | Expo push token, platform | Supabase, then the Expo push service, then APNs or FCM |
| Safety | Text of posts, comments, messages and events (no name), and text about to be posted (the pre-post check), when the safety check is on | OpenAI `/v1/moderations` (`MODERATION_PROVIDER=openai`, the default), or Anthropic's Claude API (`MODERATION_PROVIDER=claude`) |
| Email | Email address; sign-up and password emails, invite codes, the weekly digest | The SMTP service in `SMTP_URL`. Invite emails go to people who aren't members yet. |
| Radio | Request text (no name), when a member spends a radio token | Broadcast publicly over amateur radio |
| Server | IP address and request logs (no bodies, no database row values); error reports with the route only, when `SENTRY_DSN` is set | API host logs (Fly.io keeps 7 days); Sentry |

**Not collected:** advertising IDs, precise or coarse location from the device, contacts, browsing or search history, purchases or payment details, crash data unless crash reporting is turned on (see below). There is no analytics or ad SDK.

---

## Apple App Store: App Privacy

Definitions: "Collect" means data sent off the device and kept longer than real-time servicing. "Tracking" means linking your app's data with third-party data for advertising, or sharing it with data brokers. ([Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/))

**Do you or your third-party partners collect data from this app?** Yes.

**Do you use data for tracking?** **No.** There are no ads, no ad SDKs and no data brokers.

### Data types to declare (all "Linked to the user", none "Used for tracking")

| Apple category → type | Purposes | Notes |
|---|---|---|
| Contact Info → **Name** | App Functionality | Display name |
| Contact Info → **Email Address** | App Functionality | Sign-in, account notices |
| Health & Fitness → **Health** | App Functionality | **Declared to be safe.** Members type their health needs into requests. Confirm with counsel whether free text belongs here or only under Other User Content. |
| Sensitive Info → **Sensitive Info** | App Functionality | Apple's definition names "religious or philosophical beliefs". Prayer requests and the community imply them. |
| User Content → **Emails or Text Messages** | App Functionality | In-app messages and group chats |
| User Content → **Photos or Videos** | App Functionality | Media attached to posts |
| User Content → **Customer Support** | App Functionality | Reports, appeals and in-app feedback (with platform and app version) |
| User Content → **Other User Content** | App Functionality | Requests, comments, encouragements, event details, care requests |
| Identifiers → **User ID** | App Functionality | Account ID |
| Usage Data → **Product Interaction** | App Functionality, Analytics, Product Personalization | Prayer taps, follows, hidden posts (feed ranking), pilot totals |

**Not declared:**
- Location: event places are typed text, already under Other User Content.
- Device ID: a push token is a delivery address, not a device identifier. Declare it if counsel prefers to be conservative.
- Financial Info, Purchases, Contacts, Browsing History, Search History.
- Diagnostics, **while crash reporting is off**. Crash reporting is off unless `EXPO_PUBLIC_SENTRY_DSN` was set for the build.

**If crash reporting is on** (Sentry, through `EXPO_PUBLIC_SENTRY_DSN`), also declare **Diagnostics → Crash Data**, "such as crash logs". Its purpose is App Functionality, and it is **Not linked to the user**. The app strips the user, request bodies, screen taps and console logs before sending. Apple counts data as unlinked only when direct identifiers are stripped before collection, and when you never try to link it back. ([Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/))

**Privacy policy URL:** `https://<API host>/privacy`, once the reviewed `PRIVACY_POLICY.md` is in `docs/legal/`.

### Age rating questionnaire (App Store Connect → App Information → Age Ratings)

The questionnaire now asks about these capabilities. ([Apple: Age ratings](https://developer.apple.com/help/app-store-connect/reference/age-ratings))

| Question | Answer |
|---|---|
| User-Generated Content | **Yes.** Requests, comments and photos are broadly shared. |
| Social Media | **Yes.** A feed with comments, encouragements and shares. |
| Messaging and Chat | **Yes.** Direct, group and prayer-thread messages. |
| Advertising | **No** |
| Unrestricted Web Access | **No.** The app only opens specific links, such as the terms, the privacy policy and event meeting links. It has no browser of its own. |
| Parental Controls / Age Assurance | **No** for the pilot. The terms require 18+, confirmed at sign-up. |
| Content descriptors (violence, mature themes, and others) | Mostly "None". Answer **"Infrequent" for Mature/Suggestive Themes or Medical/Treatment Information** if counsel agrees, because members describe illness and crises. |

---

## Native builds

The native apps (`com.zoomatech.prayertower.native`, `com.zoomatech.opencircle.native`) send the same
data to the same server, so the answers above apply to them as they are. They have no crash
reporting SDK, so leave out Diagnostics. Their privacy manifests (`apps/ios-native/App/PrivacyInfo.xcprivacy`)
list the same data types.

## Before each submission
- [ ] There are still no analytics or ad SDKs in `apps/mobile/package.json`. Sentry is the only crash SDK, and it is off without a DSN. If you set a DSN, add Crash Data and Crash logs as described above.
- [ ] Moderation still uses OpenAI's `/v1/moderations`, which has no abuse-monitoring retention ([OpenAI: your data](https://developers.openai.com/api/docs/guides/your-data)). If `MODERATION_PROVIDER=claude`, Anthropic keeps API data up to 30 days, and flagged inputs up to 2 years ([Anthropic](https://privacy.claude.com/en/articles/7996866-how-long-does-anthropic-store-my-organizations-data)); the privacy policy must say so first ([PRIVACY_AUDIT.md](../PRIVACY_AUDIT.md), note 4).
- [ ] `https://<API host>/account-deletion` loads, and a test deletion works.
- [ ] The privacy policy is published and matches these answers.
