# App Review notes

> Drafted 2026-10-28 for the pilot, for Steve to edit before each submission. It covers the reviewer's account, the notes to paste into App Store Connect, how radio prayers and tokens work, and answers to the questions reviewers are likely to ask. Rules are quoted from the current [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), linked at each point. Check them again before you submit; they change. The pilot is iPhone only: the Google Play text is archived in [archive/GOOGLE_PLAY_DRAFTS.md](../archive/GOOGLE_PLAY_DRAFTS.md).

## 1. The reviewer's account

Apple: "include demo account info (and turn on your back-end service!) if your app includes a login", and "provide either an active demo account or fully-featured demo mode" (Guideline 2.1(a) and "Before You Submit", [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)).

**Plan**

1. **One shared review account on the hosted project.** Create it, or reset its password, with:
   ```bash
   cd apps/server   # .env points at the HOSTED project for this step only
   REVIEW_PASSWORD='choose-a-long-password' npm run review-account -- review@[YOUR DOMAIN]
   ```
   The script:
   - confirms the email, so no inbox is needed
   - finishes onboarding
   - dates the account past the new-member waiting period
   - prints the remaining new-member rule, which is how many other members' requests the reviewer must pray for before messages and links open up (default 5)

   It adds no posts. Never run `seed:demo` against the hosted project.
2. **Real sample content from staff.** Before submitting, two or three staff accounts post a few real requests, start one conversation with the review account, and create one upcoming event. This follows the 2026-09-19 decision that no made-up member content is shown. It also gives the reviewer something to pray for, report and block.
3. **Sign-in is email and password only**, with no one-time codes. There is no third-party sign-in, so Apple 4.8 (Login Services) does not apply: "Another login service is not required if your app exclusively uses your company's own account setup and sign-in systems" ([4.8](https://developer.apple.com/app-store/review/guidelines/)).
4. **Keep the API running** during review (`fly scale count app=1 worker=1`; see GO_LIVE.md).
5. **During review, set the radio to "Log only"** (Admin → Radio) and turn on **Radio prayers are free** (Admin → Tokens). The reviewer can then try "Send as a radio prayer" and see it in Prayer Cast as a test log, with nothing transmitted.
6. **The reviewer may delete the account** (Apple tests deletion). Before each new submission, run the script again. It recreates the account if it is gone and resets the password if it is not.
7. **Don't give the review account staff roles.** Moderation and admin screens are staff-only and are not part of the member experience. If a reviewer asks to see moderation, grant it for the review only: `npm run grant-role -- review@[YOUR DOMAIN] moderator`.

## 2. Notes to paste

### App Store Connect → App Review Information → Notes

Fill in the brackets. Apple asks for "detailed explanations of non-obvious features" ([Before You Submit](https://developer.apple.com/app-store/review/guidelines/)), and the text below stays well under the 4,000-character limit.

```
Prayer Tower is a prayer-request community for adults (18+), in a small invite-only pilot. Members ask for prayer and pray for one another.

Sign in: [REVIEW EMAIL] / [REVIEW PASSWORD]
The account is ready to use. Staff test accounts have posted sample requests.

To try the main features:
- Pray: tap "Praying Now" on any request. Tap "Commit to Pray" to promise to keep praying (with reminders).
- Ask: tap "Type your prayer here" on the Prayers tab.
- Message: open the Messages tab. A staff account has written to you.
- Events: Messages tab > Meetings & events.
- Report: open a request and tap "Report this request" (also on comments, messages and events).
- Block: open a person's profile and tap "Block".
- Delete account: Me > Delete my account (type DELETE). Deletion takes effect right away.
New members can message and post links once they have prayed for 5 other requests. This is an anti-spam rule.

User-generated content (Guideline 1.2):
- Filtering: every new request, comment, message and event is checked automatically, and the most severe content is hidden until a moderator reviews it.
- Reporting: there is a Report button on every piece of content, and human moderators review each report. Members are told which rule applied and can appeal.
- Blocking: members can block anyone.
- Contact: [SUPPORT URL] and [SUPPORT EMAIL].
If a post suggests someone is in crisis, the app shows the 988 Suicide & Crisis Lifeline right away.

Tokens: members earn tokens by praying for others and keeping their prayer promises. Tokens are only used inside the app, to help a request reach more people or to give to another member. They cannot be bought, sold, or exchanged for money, and nothing in the app takes payment. Having no tokens never hides a request.

Radio prayers: a member can choose to have the words of a request (never a name) sent out by a volunteer amateur radio station. During review the station is in test mode, so "Send as a radio prayer" adds a test entry under Me > Prayer Cast and nothing is transmitted. Radio prayers are free, because amateur radio rules forbid transmitting for payment.

"Help in person or with a gift" on some requests opens the website of an outside charity in the browser. Prayer Tower collects no money.

Privacy policy: [PRIVACY URL]. Terms: [TERMS URL].
```

## 3. How radio prayers work (for reviewers and for Steve)

- **What goes out.** Only the text of a request that passed moderation is sent. It is never sent with a name. The privacy policy says so in "Who can see what".
- **How.** A volunteer station claims one prayer at a time over the API. It filters the text, adds the call sign to every piece, and sends it as PSK31 through fldigi (RADIO_STATION.md). When the station is off or in "Log only" mode, nothing is transmitted.
- **Why it's free.** Amateur radio may not carry "communications for hire or for material compensation, direct or indirect, paid or promised" (97.113(a)(2)), or communications "in which the station licensee or control operator has a pecuniary interest" (97.113(a)(3)) ([47 CFR 97.113](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-D/part-97/subpart-B/section-97.113)). By default the station sends only while **Radio prayers are free** is on. If radio prayers are set to cost Priestly tokens, the station pauses until they are free again (Admin → Radio → "Station sends only while radio prayers are free").
- **Store angle.** A radio prayer is a feature inside the app, not a purchase, and it is not tied to money in any way. Nothing about it needs In-App Purchase.

## 4. How tokens work

| | Regular tokens | Priestly tokens |
|---|---|---|
| Earned by | 1 per "Praying Now" or promise check-in (once per request per day, never for your own request), a weekly allotment by tier, and milestone bonuses | 1 per 10 verified prayers for others, with minimum time gaps between them (both settings can be changed) |
| Used for | Helping a request reach more people, giving to a member or a request, scheduled gifts, token pools | Radio prayers (when they are not free), or donating to keep the prayer infrastructure running |
| Bought or cashed out | Never. There is no purchase screen. | Never |

**Why this is fine under Apple's rules**

- **Apple.** Apple 3.1.1 requires In-App Purchase when you "unlock features or functionality" with "in-game currencies" that are purchased. It also says purchased credits "may not expire" ([3.1.1](https://developer.apple.com/app-store/review/guidelines/)).
  - Prayer Tower tokens are never sold, so no In-App Purchase item exists.
  - Apple also allows apps to "incentivize users to take specific actions within apps" ([3.2.2(x)](https://developer.apple.com/app-store/review/guidelines/)). Earning tokens by praying is exactly that.
  - **If tokens are ever sold**, they must use In-App Purchase, and purchased tokens must not expire. That would conflict with the current terms ("Tokens end when your account is deleted, or when the pilot ends"), so the terms would need a change first.
- **Abuse safeguard.** Tokens earned by automated praying are flagged for a moderator to review and can be reversed (Terms section 7).

## 5. Likely review questions, with answers

| Question | Answer |
|---|---|
| **Where is account deletion?** (Apple 5.1.1(v): "If your app supports account creation, you must also offer account deletion within the app") | In the app: Me → Delete my account. It takes effect right away. On the web: `[API HOST]/account-deletion`, with sign-in-and-delete or a request form. |
| **How do you moderate user content?** (Apple 1.2) | Automated filtering of every new request, comment, message and event; a Report button on all of them; human moderators with logged decisions and appeals; blocking; and published contact details on `/support`. |
| **Is religious content handled respectfully?** (Apple 1.1.5 forbids "inflammatory religious commentary or inaccurate or misleading quotations of religious texts") | The Community Rules forbid praying for harm and pile-ons. Scripture leaves are exact KJV text. The app is ecumenical and Christian. |
| **Does the app give medical or crisis advice?** (Apple 1.4.1) | No. It shows crisis lines (988 in the US) and says it is not an emergency service. Prayer partners and pastors offer prayer, not professional services (Terms section 3). |
| **What are tokens, and can users buy them?** (Apple 3.1.1) | See section 4. Tokens are earned only, can't be bought or cashed out, and have no money value. |
| **What is a "radio prayer"?** | See section 3. It is free and has no names. It is in test mode during review. |
| **Does the app collect donations?** (Apple 3.2.2(iv)) | No. "Help in person or with a gift" opens an outside charity's site in the browser. Priestly tokens are in-app tokens, not money. A real-money "Common Prayer Fund" would need approved-nonprofit status with Apple Pay (Apple 3.2.1(vi)) or collection outside the app. It is not built. |
| **Why must members be 18+?** | It is a pilot choice, given private messaging and in-person events. The age rating questionnaire should declare user-generated content and messaging. See the counsel questions in TERMS_OF_USE_DRAFT.md. |
| **Anonymous posting?** (Apple 1.2 warns about "anonymous bullying" and "random or anonymous chat") | Anonymous posting hides the name from members only. Moderators can see who wrote a post, and every rule and report applies. There is no random or anonymous chat: messages go only between people connected through a request, a group or an accepted message request. |
| **Do you need Sign in with Apple?** | No. The app uses only its own email-and-password sign-in (Apple 4.8 exception). |
| **What data do you collect?** | See APP_PRIVACY_ANSWERS.md and the privacy policy. There is no tracking, no ads and no data sale. |
| **The app looks unfinished, or "pilot".** (Apple 2.1 rejects "placeholder text, empty websites, and other temporary content") | Before you submit, replace every `[BRACKET]` in the legal pages and publish the reviewed `PRIVACY_POLICY.md` and `TERMS_OF_USE.md`. Draft pages show a "DO NOT PUBLISH" warning, and a reviewer will reject them. Make sure the review account's feed has real staff posts. |

## 6. Before each submission

- [ ] Run `REVIEW_PASSWORD='…' npm run review-account -- review@[YOUR DOMAIN]` on the hosted project, and paste the password into App Store Connect.
- [ ] Staff sample requests, one message to the review account, and one upcoming event are in place.
- [ ] Admin → Radio is set to **Log only**, and **Radio prayers are free** is on.
- [ ] The reviewed privacy policy and terms are published, with no brackets and no DRAFT banner, in English.
- [ ] The API and worker are running, and `/health` answers.
- [ ] The notes above match the build. Update them if a feature moved or was switched off.
