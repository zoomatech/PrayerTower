# TestFlight test information (copy and paste)

Paste these into **App Store Connect → your app → TestFlight → Test Information**. Apple needs a Beta App Description, review information and a feedback email before external testers can install the app ([Apple: Enter test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/enter-test-information), [TestFlight](https://developer.apple.com/testflight/)). Each text below is well under 4,000 characters.

`scripts/testflight.sh` builds the app and sends it to TestFlight. Then do these four steps.

## 1. Beta App Description (Prayer Tower)

```text
Prayer Tower is an ad-free place where real people pray for each other by name.

Post a prayer request, or pray for someone else's with one tap. Answered prayers can be shared as testimonies, and you can follow a request until it is answered. Every prayer you pray earns a token you can keep, spend, or give to someone who needs it.

This is a small, invite-only pilot. Things will break, and that is why you are here. Use "Tell Steve" on the feed or the Me tab to say what is confusing, broken, or missing. Each note goes straight to the team.

There are no ads, no tracking and no selling of your data.
```

## 1b. Beta App Description (Open Circle)

```text
Open Circle is an ad-free place where real people cheer each other on.

Share what you are going through, or lift someone else up with one tap. You can follow a post until things get better, and every kind act earns a token you can keep, spend or give away.

This is a small, invite-only pilot. Things will break, and that is why you are here. Use "Tell Steve" on the feed or the Me tab to say what is confusing, broken or missing. Each note goes straight to the team.

There are no ads, no tracking and no selling of your data.
```

## 2. What to Test (each build)

```text
Please try these, and use "Tell Steve" for anything that feels wrong:
1. Sign up with your invite code, and finish the welcome steps.
2. Post a request, then pray for (or lift up) two others.
3. Turn on notifications, and check that one arrives when someone prays for you.
4. Send a message, then report and block a test post.
5. Open Me → Tokens and give a token to someone.
```

## 3. Feedback Email

Use the `SUPPORT_EMAIL` address from `deploy/production.env`. Apple also uses it as the reply-to address on TestFlight invitations.

## 4. Beta App Review Information

- **Sign-in:** the review account from [REVIEW_NOTES.md](REVIEW_NOTES.md), section 1 (`npm run review-account`).
- **Notes:** paste section 2 of [REVIEW_NOTES.md](REVIEW_NOTES.md).

## Then turn on the public link

1. Go to **TestFlight → External Testing**, add a group (for example "Pilot"), and add the build. Apple reviews the first build.
2. Open the group, then **Public Link → Enable Public Link**. Set the tester limit, for example 25.
3. Put the link in `deploy/production.env` as `TESTFLIGHT_URL=https://testflight.apple.com/join/…`, then run `scripts/go-live.sh`. Open Circle's link goes in `OPEN_CIRCLE_TESTFLIGHT_URL`.

From then on, every invite email from **Admin → Invite codes → Email** tells iPhone users to install TestFlight from the App Store and open the link. The email also carries their code and the sign-up link.

## Pilot invite email (to send yourself, if you prefer)

Admin → Invite codes → Email sends this for you, with the code filled in. If you'd rather send it from your own email account, here is the same text:

```text
Subject: You're invited to the Prayer Tower pilot

Hi [NAME],

I'm testing Prayer Tower, an ad-free app where real people pray for each other by name, with a small group before it opens up. I'd love for you to be part of it.

1. On your iPhone, install Apple's free TestFlight app from the App Store.
2. Open this link on the same iPhone and tap Install: [TESTFLIGHT LINK]
3. Open Prayer Tower, tap "New here? Create an account", and enter your invite code: [CODE]

Things will break, and that's the point. Tap "Tell Steve" in the app whenever something is confusing or broken.

Thank you,
Steve
```
