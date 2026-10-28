# Prayer Tower Privacy Policy (DRAFT)

> **DRAFT FOR LAWYER REVIEW. NOT LEGAL ADVICE. DO NOT PUBLISH UNTIL REVIEWED.**
> Written 2026-10-28 from the app as built in PR #4. Fill in every `[BRACKET]` before publishing. The reviewer notes at the end list the rules this draft follows and the questions for counsel.

**Effective date:** [DATE]
**Operator:** [LEGAL NAME OF OPERATOR], [ADDRESS] ("Prayer Tower", "we", "us")
**Contact:** [PRIVACY EMAIL] · [PHONE]

Prayer Tower is a community where people ask for prayer and pray for one another. Prayer requests are personal, and they often reveal your faith, your health or your family's struggles. This policy explains what we collect, why we collect it, who can see it, and how to delete it.

**The short version**
- We don't sell your information, we don't show ads, and we don't track you across other apps or websites.
- The requests you post are seen by other members. Your private messages are seen only by the people in the conversation, plus our moderators when content is reported or flagged for safety.
- You can post anonymously. Anonymous posts hide your name from other members, but our safety staff can still see who wrote them.
- You can delete your account at any time in the app (Me → Delete my account). Deletion happens right away.

## 1. Information we collect

**Information you give us**

| What | Examples | Why |
|---|---|---|
| Account | Email address, password (stored in hashed form by our sign-in provider), display name | To create your account and sign you in |
| Profile | Handle, short bio, why you're here, the support you want or can offer, your feed and reminder preferences | To show your profile and personalize your feed |
| Prayer requests and posts | The text of requests, praises and testimonies, the kind and urgency you choose, and photos or videos you attach | To share them with the community |
| Comments, encouragements and thanks | The text you write | To share them with the person and the community |
| Private messages and group chats | Message text, the people in the conversation, and requests to talk | To deliver your messages |
| Events | The title, description, place and video-meeting link you enter, and your RSVPs | To run prayer meetings and meet-ups |
| Prayer partner and pastor requests | What you'd like prayer for | To connect you with a prayer partner or pastor |
| Reports and appeals | What you report and why, and your appeal text | To keep the community safe |
| Feedback | What you write in Send feedback, your phone type (iOS or Android) and the app version | To fix problems and improve the app |

**Information created as you use the app**
- **Prayer activity:** when you tap "Praying Now", the promises you make and your check-ins, the reminders you answer, who you follow and block, and the posts you hide.
- **Tokens:** a ledger of the tokens you earn, give and receive. Tokens have no cash value.
- **Device:** a push notification token and your device's platform, used to send you notifications.
- **Server logs:** the time of each request, your IP address and any errors. We use these for security and to fix problems, and keep them for [30] days.

**Sensitive information.** What you write may reveal your religious beliefs, your health or that of others, and other sensitive matters. We use this information only to provide the service as described here. By posting it, you choose to share it with the community, and you can delete it at any time.

**Information we don't collect:** precise location, contacts, browsing history, advertising identifiers, or payment details. During the pilot, nothing in the app takes payment.

## 2. How we use information
- To run Prayer Tower: show requests, deliver prayers, messages and notifications, run events, and connect prayer partners.
- **To keep people safe.**
  - New posts, comments, messages and event descriptions are checked automatically for harmful content and for signs that someone may be in crisis. When the check is on, the text is sent to OpenAI's moderation service (see section 4).
  - Trained moderators review reports and flagged content.
  - If a post suggests someone may be in danger, we show crisis resources such as the 988 Suicide & Crisis Lifeline, and a moderator may reach out.
- **To prevent abuse.** We look for prayer activity that seems automated, such as hundreds of taps an hour. Patterns like this are flagged for a person to review, and nothing happens automatically.
- **To improve the pilot.** We review totals, such as how many requests were prayed for, without looking at individual members.
- **To communicate with you** about your account, safety notices, moderation decisions and appeals.

We do not use your information for advertising, and we do not sell it or share it for cross-context behavioral advertising.

## 3. Who can see what

| Content | Who sees it |
|---|---|
| Prayer requests, praises, comments, encouragements | All Prayer Tower members. If you post anonymously, members see "Anonymous". |
| Your profile (name, handle, bio) | All members |
| Private messages and group chats | The people in the conversation. Moderators see a message only when it is reported or flagged by the safety check. |
| Prayer partner and pastor requests | Prayer partners and pastors who serve on the care team |
| Who prayed for a request | The person who asked, and other members, unless you prayed anonymously |
| Anonymous posts | Members see "Anonymous". Moderators and the Witness team (staff who help members in serious need) can see who wrote them, so they can help in an emergency. |
| **Radio prayers** | If a member spends a token to have a request sent by amateur radio, the text of that request is broadcast and **anyone with a receiver can hear it**. Your name is never transmitted. Only requests that pass moderation are sent. |

## 4. Service providers

We use the companies below to run the app. They process information on our behalf and under our instructions, and we require them to protect it at least as well as this policy does.

| Provider | What it does | What it receives |
|---|---|---|
| Supabase | Database, sign-in and file storage | Everything stored by the app |
| [HOSTING PROVIDER] | Runs our API server | Requests to the API |
| OpenAI (moderation API) | Automated safety check, when switched on | The text being checked, without your name. OpenAI says API data isn't used to train its models by default. Its moderations endpoint is not covered by abuse-monitoring retention. ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)) |
| Sentry (error reporting), when switched on | Tells us when the app or server crashes | Crash details: the stack trace, device and app version, and the screen or route. It does not receive your name, account or anything you wrote. |
| Expo push service, Apple Push Notification service, Firebase Cloud Messaging | Deliver notifications | Your push token and the notification text |
| Video meeting services (for example Zoom or Google Meet) | Only when you choose to open an event's meeting link | Whatever you share with that service, under its own policy |

We may also disclose information when the law requires it, to protect someone's life or safety, or as part of a merger or transfer of the service, in which case this policy continues to apply.

## 5. How long we keep information, and deleting it
- **Delete your account** in the app at Me → Delete my account. This takes effect right away and removes:
  - your sign-in and email
  - your profile details
  - your requests, comments, encouragements, photos and messages
  - your promises, events, RSVPs, prayer history, notifications and devices
- **What we keep after deletion:**
  - **(a) The token ledger.** This is a permanent, append-only record of token movements, kept so balances stay correct for everyone. It is kept under an anonymous "Deleted member" label.
  - **(b) Records of moderation decisions.** These are needed for safety and appeals.
  - **(c) Requests that hold tokens other members gave.** These are emptied of their text and taken down rather than erased.

  None of these is linked to your name or email.
- **Server logs** are deleted after [30] days. Database backups roll off within [7 / 30] days.
- You can hide posts, block people, or leave a conversation at any time. Deleting a single post isn't in the app yet. Until it is, email [PRIVACY EMAIL] and we will remove the post.

## 6. Your choices
- Post or pray anonymously, and make anonymous your default.
- Turn notifications and prayer reminders on or off. Choose gentle or firmer reminders.
- Hide trauma-related content.
- Block anyone. Blocking hides their posts, comments and messages from you.
- Ask us at [PRIVACY EMAIL] for a copy of your information, or to correct it.

## 7. Your rights under state law

Depending on where you live, you may have the right to:
- know what we collect, and get a copy of it
- correct it, or delete it
- opt out of its sale or of targeted advertising (we do neither)
- limit our use of sensitive information

Several states treat religious beliefs and health information as sensitive, and require consent before that information is processed. We ask for that consent when you create an account and choose to post, and you can withdraw it by deleting your content or your account. To use any of these rights, email [PRIVACY EMAIL]. We will not treat you differently for doing so. If we deny your request, you can appeal by replying to our answer.

## 8. Security

All connections to Prayer Tower use encryption in transit (HTTPS/TLS). The database can be reached only by our API server, and access is limited by role. Photos and videos are stored privately and shown through links that expire. No system is perfectly secure. If a breach affects your information, we will tell you as the law requires.

## 9. Children

Prayer Tower is for people **18 and older** during the pilot. We do not knowingly collect information from children under 13. If we learn that a child under 13 has created an account, we will delete it. Parents can contact [PRIVACY EMAIL].

## 10. Changes

If we make a material change, we will tell you in the app before it takes effect. The date at the top shows the latest version.

## 11. Contact

[LEGAL NAME OF OPERATOR] · [ADDRESS] · [PRIVACY EMAIL] · [PHONE]

---

## Reviewer notes (remove before publishing)

**Requirements this draft is built to meet**
1. **Apple 5.1.1(i).** The policy must say what is collected, how and why. It must confirm that third parties give "the same or equal protection", and it must explain retention and deletion and how to revoke consent. It must be linked in App Store Connect and inside the app. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)) The app now links to the policy at sign-up and on the profile, through `EXPO_PUBLIC_PRIVACY_URL`.
2. **Apple 5.1.1(v).** In-app account deletion must cover content "shared with others", and say what is kept for legal reasons. ([Account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion))
3. **Apple privacy labels.** Apple counts "religious or philosophical beliefs" as Sensitive Info. ([App privacy details](https://developer.apple.com/app-store/app-privacy-details/)) See `docs/store/APP_PRIVACY_ANSWERS.md`.
4. **Google Play Data safety.** The form needs a privacy policy link, a statement on encryption in transit, and a way to request deletion. ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/10787469))
5. **Google Play UGC policy.** Users must accept the terms or user policy "before users can create or upload UGC". ([UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)) The sign-up screen now says that creating an account means agreeing to the terms.
6. **State laws.** Religious beliefs are sensitive data in CA, VA, CO, CT, TX, OR and MD, and most of those states require opt-in consent. ([Privacy Law Map](https://privacylawmap.com/blog/sensitive-data-state-privacy-laws-guide)) A 10-person pilot is probably below most thresholds, but **Texas has no threshold** (same source).
7. **FTC Health Breach Notification Rule (2024 update).** It covers health apps that are not under HIPAA, and treats an "unauthorized disclosure" as a breach. Notices are due within 60 days. ([FTC](https://www.ftc.gov/business-guidance/blog/2024/04/updated-ftc-health-breach-notification-rule-puts-new-provisions-place-protect-users-health-apps)) Ask counsel whether free-text health needs in prayer requests make Prayer Tower a "personal health record" vendor.
8. **COPPA.** It applies to general-audience apps once the operator has "actual knowledge" that a user is under 13. ([FTC](https://www.ftc.gov/node/60359)) The draft sets 18+ for the pilot.

**Questions for counsel**
- Which entity operates the app (for-profit, non-profit, or ministry), and which state's law governs?
- Is an explicit consent checkbox for sensitive information needed at sign-up, or is the current agreement line plus the posting action enough?
- Does broadcasting request text by amateur radio need its own consent at the moment a member spends a radio token?
- Do the token ledger and moderation records count as a "legal requirement" to keep after deletion, or only a legitimate interest?
- Is the HBNR question above a real risk? If so, write a breach-response plan.
