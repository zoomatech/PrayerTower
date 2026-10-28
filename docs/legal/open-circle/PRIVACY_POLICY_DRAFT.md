# {{NAME}} Privacy Policy (DRAFT)

> **DRAFT FOR LAWYER REVIEW. NOT LEGAL ADVICE. DO NOT PUBLISH UNTIL REVIEWED.**
> Written 2026-10-28. Fill in every `[BRACKET]` before publishing. The reviewer notes at the end list the rules this draft follows and the questions for counsel.

**Effective date:** [DATE]
**Operator:** [LEGAL NAME OF OPERATOR], [ADDRESS] ("{{NAME}}", "we", "us")
**Contact:** [PRIVACY EMAIL] · [PHONE]

{{NAME}} is an ad-free community where people ask for support and lift one another up. Requests are personal, and they can reveal your health or your family's struggles. This policy explains what we collect, why we collect it, who can see it, and how to delete it.

**The short version**
- We don't sell your information, we don't show ads, and we don't track you across other apps or websites.
- The requests you post are seen by other members. Your private messages are seen only by the people in the conversation, plus our moderators when content is reported or flagged for safety.
- You can post anonymously. Anonymous posts hide your name from other members, but our safety staff can still see who wrote them.
- You can delete your account at any time in the app (Me → Delete my account). Deletion happens right away.

## 1. Information we collect

**Information you give us**

| What | Examples | Why |
|---|---|---|
| Account | Email address, password (stored in hashed form by our sign-in provider), display name | To create your account and sign you in, and, only if you turn on the weekly email, to send it to you |
| Profile | Handle, short bio, why you're here, the support you want or can offer, your feed and reminder preferences | To show your profile and personalize your feed |
| Requests and posts | The text of requests, good news and stories, the kind and urgency you choose, and photos or videos you attach | To share them with the community |
| Comments, encouragements and thanks | The text you write | To share them with the person and the community |
| Private messages and group chats | Message text, the people in the conversation, and requests to talk | To deliver your messages |
| Events | The title, description, place and video-meeting link you enter, and your RSVPs | To run meet-ups and group calls |
| Listening partner and mentor requests | What you'd like to talk about | To connect you with a listening partner or mentor |
| Reports and appeals | What you report and why, and your appeal text | To keep the community safe |
| Feedback | What you write in Send feedback, your phone type (iOS or Android) and the app version | To fix problems and improve the app |

**Information created as you use the app**
- **Support activity:** when you tap "Thinking of You", the promises you make and your check-ins, the reminders you answer, who you follow and block, and the posts you hide.
- **Tokens:** a ledger of the tokens you earn, give and receive. Tokens have no cash value.
- **Device:** a push notification token and your device's platform, used to send you notifications.
- **Server logs:** the time of each request, your IP address and any errors. We use these for security and to fix problems, and keep them for [30] days.

**Sensitive information.** What you write may reveal your health or that of others, your beliefs, and other sensitive matters. We use this information only to provide the service as described here. By posting it, you choose to share it with the community, and you can delete it at any time.

**Information we don't collect:** precise location, contacts, browsing history, advertising identifiers, or payment details. During the pilot, nothing in the app takes payment.

## 2. How we use information
- To run {{NAME}}: show requests, deliver messages and notifications, run events, and connect listening partners.
- **To keep people safe.**
  - New posts, comments, messages and event descriptions are checked automatically for harmful content and for signs that someone may be in crisis. When the check is on, the text is sent to OpenAI's moderation service (see section 4).
  - Trained moderators review reports and flagged content.
  - If a post suggests someone may be in danger, we show crisis resources such as the 988 Suicide & Crisis Lifeline, and a moderator may reach out.
- **To prevent abuse.** We look for activity that seems automated, such as hundreds of taps an hour. Patterns like this are flagged for a person to review, and nothing happens automatically.
- **To improve the pilot.** We review totals, such as how many requests got support, without looking at individual members.
- **To communicate with you** about your account, safety notices, moderation decisions and appeals.

We do not use your information for advertising, and we do not sell it or share it for cross-context behavioral advertising.

## 3. Who can see what

| Content | Who sees it |
|---|---|
| Requests, good news, stories, comments, encouragements | All {{NAME}} members. If you post anonymously, members see "Anonymous". |
| Your profile (name, handle, bio) | All members |
| Private messages and group chats | The people in the conversation. Moderators see a message only when it is reported or flagged by the safety check. |
| Listening partner and mentor requests | Listening partners and mentors who serve on the care team |
| Who supported a request | The person who asked, and other members, unless you chose to stay anonymous |
| Anonymous posts | Members see "Anonymous". Moderators and the Witness team (staff who help members in serious need) can see who wrote them, so they can help in an emergency. |
| **Radio messages** | If a member spends a Lighthouse token to have a request sent by amateur radio, the text of that request is broadcast and **anyone with a receiver can hear it**. Your name is never transmitted. Only requests that pass moderation are sent. |

## 4. Service providers

We use the companies below to run the app. They process information on our behalf and under our instructions, and we require them to protect it at least as well as this policy does.

| Provider | What it does | What it receives |
|---|---|---|
| Supabase | Database, sign-in and file storage | Everything stored by the app |
| [HOSTING PROVIDER] | Runs our API server | Requests to the API |
| OpenAI (moderation API) | Automated safety check, when switched on | The text being checked, without your name. OpenAI says API data isn't used to train its models by default. Its moderations endpoint is not covered by abuse-monitoring retention. ([OpenAI](https://developers.openai.com/api/docs/guides/your-data)) |
| Anthropic (Claude API), if we choose it instead of OpenAI | Automated safety check, when switched on | The text being checked, without your name. Anthropic says that by default it does not use inputs or outputs from its commercial products, including the API, to train its models. ([Anthropic](https://privacy.claude.com/en/articles/7996868-is-our-data-used-for-model-training)) |
| Sentry (error reporting), when switched on | Tells us when the app or server crashes | Crash details: the stack trace, device and app version, and the screen or route. It does not receive your name, account or anything you wrote. |
| Expo push service, Apple Push Notification service, Firebase Cloud Messaging | Deliver notifications | Your push token and the notification text |
| Video meeting services (for example Zoom or Google Meet) | Only when you choose to open an event's meeting link | Whatever you share with that service, under its own policy |

We may also disclose information when the law requires it, to protect someone's life or safety, or as part of a merger or transfer of the service, in which case this policy continues to apply.

## 5. How long we keep information, and deleting it
- **Delete your account** in the app at Me → Delete my account. This takes effect right away and removes:
  - your sign-in and email
  - your profile details
  - your requests, comments, encouragements, photos and messages
  - your promises, events, RSVPs, support history, notifications and devices
- **What we keep after deletion:**
  - **(a) The token ledger.** This is a permanent, append-only record of token movements, kept so balances stay correct for everyone. It is kept under an anonymous "Deleted member" label.
  - **(b) Records of moderation decisions.** These are needed for safety and appeals.
  - **(c) Requests that hold tokens other members gave.** These are emptied of their text and taken down rather than erased.

  None of these is linked to your name or email.
- **Server logs** are deleted after [30] days. Database backups roll off within [7 / 30] days.
- **Content our moderators removed** keeps no text or photos after [90] days from the decision, unless you have appealed and the appeal is still open.
- **Notifications** in the app are deleted after [90] days.
- **Deletion requests** sent from our website, which include your email address, are deleted [30] days after we handle them.
- Actions you take while offline wait on your phone for up to 3 days, then are dropped.
- You can hide posts, block people, or leave a conversation at any time. You can delete any of your own requests or comments from the request screen.

## 6. Your choices
- Post or support others anonymously, and make anonymous your default.
- Turn notifications and check-in reminders on or off. Choose gentle or firmer reminders.
- Hide trauma-related content.
- Block anyone. Blocking hides their posts, comments and messages from you.
- Download a copy of your information any time from Me → Download my data (a JSON file), or ask us at [PRIVACY EMAIL] for a copy or a correction.

## 7. Your rights under state law

Depending on where you live, you may have the right to:
- know what we collect, and get a copy of it
- correct it, or delete it
- opt out of its sale or of targeted advertising (we do neither)
- limit our use of sensitive information

Several states treat health information and beliefs as sensitive, and require consent before that information is processed. We ask for that consent when you create an account and choose to post, and you can withdraw it by deleting your content or your account. To use any of these rights, email [PRIVACY EMAIL]. We will not treat you differently for doing so. If we deny your request, you can appeal by replying to our answer.

## 8. Security

All connections to {{NAME}} use encryption in transit (HTTPS/TLS). The database can be reached only by our API server, and access is limited by role. Photos and videos are stored privately and shown through links that expire. No system is perfectly secure. If a breach affects your information, we will tell you as the law requires.

## 9. Children

{{NAME}} is for people **18 and older** during the pilot. We do not knowingly collect information from children under 13. If we learn that a child under 13 has created an account, we will delete it. Parents can contact [PRIVACY EMAIL].

## 10. Changes

If we make a material change, we will tell you in the app before it takes effect. The date at the top shows the latest version.

## 11. Contact

[LEGAL NAME OF OPERATOR] · [ADDRESS] · [PRIVACY EMAIL] · [PHONE]

---

## Reviewer notes (remove before publishing)


**Open Circle edition**
- `{{NAME}}` is replaced with the edition's name (`OPEN_CIRCLE_NAME`) when the page is served.
- This policy is the Prayer Tower draft in Open Circle's words, with the same data practices: Open Circle shares the server, database and providers with Prayer Tower.
- Have counsel review both together. The Prayer Tower reviewer notes (`../PRIVACY_POLICY_DRAFT.md`) apply here too, except where they rest on religious beliefs being implied by every post. Open Circle doesn't ask members about beliefs, so Apple's "Sensitive Info" declaration is not assumed (see `docs/store/open-circle/APP_PRIVACY_ANSWERS.md`).
