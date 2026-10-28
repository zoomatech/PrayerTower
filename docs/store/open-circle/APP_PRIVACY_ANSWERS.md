# Open Circle: App Store privacy answers (draft)

For the Open Circle app (`com.zoomatech.opencircle`). It is the same code, server and database as Prayer Tower, so it collects the same data in the same ways: see the full table in [../APP_PRIVACY_ANSWERS.md](../APP_PRIVACY_ANSWERS.md). Only the differences are listed here.

> Drafted 2026-10-28. **Check again before each submission** if a feature, SDK or server integration changes, and keep these answers in step with the Open Circle privacy policy (`docs/legal/open-circle/PRIVACY_POLICY_DRAFT.md`, served at `/privacy` on its domain and at `/open-circle/privacy`).

## The one real difference: no religious content

Prayer Tower declares **Sensitive Info**, because every prayer request implies "religious or philosophical beliefs", which Apple lists as Sensitive Info ([Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)).

Open Circle has no religious content and never asks about beliefs. Apple's guidance for free text: "Mark 'Other User Content' to represent generic free form text fields... You're not responsible for disclosing all possible data that users may manually enter in the app through free-form fields... However, if you ask a user to input a specific data type into a text field... you'll need to disclose the specific type of data." (same page)

So for Open Circle:

| Apple category → type | Prayer Tower | Open Circle | Why |
|---|---|---|---|
| Sensitive Info → **Sensitive Info** | Declared | **Not declared** | No question or feature asks for beliefs, health or other sensitive data. Requests are free text, already under Other User Content. Declare it if Steve prefers to be conservative. |
| Health & Fitness → **Health** | Declared to be safe | **Declared to be safe** | Members may still describe an illness when they ask for support. Same reasoning as Prayer Tower. |

Everything else is the same as Prayer Tower: Name, Email Address, Emails or Text Messages, Photos or Videos, Customer Support, Other User Content, User ID and Product Interaction, all **Linked to the user**, none **Used for tracking**. Crash Data is added only if crash reporting is on for the build.

## Data used to track you

**No.** There are no ads, no ad SDKs and no data brokers, the same as Prayer Tower.

## Purchases

If App Store token purchases are switched on (`docs/TOKEN_PURCHASE.md`), add **Purchases → Purchase History** (App Functionality, Linked to the user) to both apps. They are off by default.

## Radio

If a member spends a Lighthouse token to send a request out by amateur radio, the request text (never a name) is broadcast publicly, as in Prayer Tower. The policy says so in "Who can see what".

## Age rating questionnaire

The same answers as Prayer Tower ([../APP_PRIVACY_ANSWERS.md](../APP_PRIVACY_ANSWERS.md) → Age rating questionnaire): User-Generated Content Yes, Social Media Yes, Messaging and Chat Yes, Advertising No, Unrestricted Web Access No, 18+ in the terms.

## URLs for App Store Connect

| Field | Value |
|---|---|
| Privacy Policy URL | `https://<Open Circle domain>/privacy`, or `https://<API host>/open-circle/privacy` |
| Support URL | `https://<Open Circle domain>/support`, or `https://<API host>/open-circle/support` |
| Account deletion (for review notes) | `https://<Open Circle domain>/account-deletion`, or `https://<API host>/open-circle/account-deletion` |

## Before each submission
- [ ] The checklist in [../APP_PRIVACY_ANSWERS.md](../APP_PRIVACY_ANSWERS.md) → Before each submission passes for the Open Circle build too.
- [ ] `/open-circle/privacy` (or `/privacy` on the Open Circle domain) shows the Open Circle policy, not Prayer Tower's.
- [ ] The Open Circle build was made with `EXPO_PUBLIC_EDITION=open-circle` and `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` pointing at the Open Circle pages.
