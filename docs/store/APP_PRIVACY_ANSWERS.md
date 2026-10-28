# App Store privacy label and Google Play Data safety answers

> Drafted 2026-10-28 from the code in PR #4. **Check again before each submission** if a feature, SDK or server integration changes. Have counsel review these together with the privacy policy draft (`docs/legal/PRIVACY_POLICY_DRAFT.md`). The stores hold the developer responsible for accurate answers.

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
| Safety | Text of posts, comments, messages and events (no name), when `OPENAI_API_KEY` is set | OpenAI `/v1/moderations` |
| Radio | Request text (no name), when a member spends a radio token | Broadcast publicly over amateur radio |
| Server | IP address and request logs | API host logs |

**Not collected:** advertising IDs, precise or coarse location from the device, contacts, browsing or search history, purchases or payment details, crash SDK data (there is no analytics or crash SDK).

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
- Financial Info, Purchases, Contacts, Browsing History, Search History, Diagnostics.

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

## Google Play: Data safety (Play Console → App content → Data safety)

Definitions: "Collect" means transmitting data off the device. "Sharing" means transferring data to a third party. Transfers to **service providers** acting on your instructions, and **user-initiated** transfers, are not sharing. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469))

### Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** HTTPS/TLS to the API and Supabase. |
| Which ways can users request that their data is deleted? | **In-app:** Me → Delete my account. **Web link:** `https://<your API host>/account-deletion`. Google requires a web resource where people can request deletion without reinstalling the app. ([Play: account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)) The API server hosts this page. People can sign in there and delete their account at once (this needs `SUPABASE_PUBLISHABLE_KEY` on the server), or leave a request that admins handle under Admin → Account deletion requests after confirming by email. Set `SUPPORT_EMAIL` so the page shows a contact address. |
| Account creation | "My app allows users to create an account" → username/email and password |

### Data types (all **Collected**, **Not shared**, processing **not ephemeral**, collection **required** unless noted)

| Play category → type | Purposes | Optional? |
|---|---|---|
| Personal info → **Name** | App functionality, Account management | Required |
| Personal info → **Email address** | App functionality, Account management | Required |
| Personal info → **User IDs** | App functionality, Account management | Required |
| Personal info → **Political or religious beliefs** | App functionality | Required (implied by using the app) |
| Health and fitness → **Health info** | App functionality | **Optional** (only if the member writes it) |
| Messages → **Other in-app messages** | App functionality | Optional |
| Photos and videos → **Photos**, **Videos** | App functionality | Optional |
| App activity → **App interactions** | App functionality, Analytics, Personalization | Required |
| App activity → **Other user-generated content** | App functionality | Required to post |
| App activity → **Other actions** (reports, blocks, follows) | App functionality, Fraud prevention, security and compliance | Optional |
| Device or other IDs → **Device or other IDs** | App functionality (push token) | Optional (notifications) |

**Shared:** **None.** These count as service providers: Supabase, the API host, OpenAI moderation, and the Expo, APNs and FCM push services. Content that other members see inside the app isn't "sharing" to a third party.

**Ask counsel:** the amateur-radio broadcast of request text is public, and the member who spends the token starts it, not the poster. Decide whether to declare "Other user-generated content: Shared", or to require the poster's own opt-in before a request can go on the radio.

**Privacy policy URL:** same as Apple.

---

## Before each submission
- [ ] There are still no analytics, crash or ad SDKs in `apps/mobile/package.json`. If one is added, update both forms.
- [ ] Moderation still uses only OpenAI's `/v1/moderations`, not chat or completions, which are retained for abuse monitoring by default. ([OpenAI: your data](https://developers.openai.com/api/docs/guides/your-data))
- [ ] `https://<API host>/account-deletion` loads, and a test deletion works.
- [ ] The privacy policy is published and matches these answers.
