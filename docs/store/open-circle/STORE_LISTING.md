# Open Circle: App Store listing (draft)

The ad-free, non-religious edition (docs/OPEN_CIRCLE.md), built from the same code with `EXPO_PUBLIC_EDITION=open-circle`. iPhone and iPad only, English only.

> Drafted 2026-10-28 for Steve to edit. **"Open Circle" is a placeholder name.** When Steve picks the real one, change it here, in `EXPO_PUBLIC_OPEN_CIRCLE_NAME` for the build, in `OPEN_CIRCLE_NAME` on the server, and in Admin → Communities. Field limits: app name and subtitle 30 characters, Promotional Text 170, Description 4,000, Keywords 100 bytes ([Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). Nothing here uses a religious word, and "Ted Lasso" never appears (it is Apple TV's trademark).

`EXPO_PUBLIC_EDITION=open-circle eas metadata:push` uploads the fields below (apps/mobile/store.config.js). Keep each in its code block under the same label; the app's tests check Apple's limits and that no religious word appears.

## App information

**App name** (11/30)
```
Open Circle
```

**Subtitle** (19/30)
```
Kind people, no ads
```

**Bundle ID:** `com.zoomatech.opencircle` (its own App Store Connect app record and EAS project)

**Promotional text** (155/170). You can change this without a new build.
```
Ask for support in a few words and know real people are thinking of you. Lift others up, share good news, and keep your promises to check in. No ads, ever.
```

**Keywords** (95/100 bytes). Apple already indexes the app name, so it isn't repeated.
```
kindness,support,encouragement,community,ad-free,friends,neighbors,wellbeing,goodwill,good news
```

**Description** (1371/4,000)
```
Open Circle is a small, kind place to ask for support and to lift other people up. No ads, no selling your information, and no outrage.

ASK FOR SUPPORT
Share what's going on in a few words: a hard week, a job search, a family worry, a win you want to celebrate. Post with your name or anonymously. You'll see when people are thinking of you, and you can thank them.

LIFT SOMEONE UP
Read real requests from real people and tap "Thinking of You" to let them know. Promise to check in daily or weekly, and Open Circle will gently remind you. Write a private note to say you care.

SHARE GOOD NEWS
Celebrate wins, big and small, and tell the stories of everyday kindness that make a day better.

TOGETHER
Join groups, message the people you support, and find meet-ups, in person or by video. Ask for a listening partner or a mentor when you'd rather not carry something alone.

A SAFE COMMUNITY
Clear community rules, reporting and blocking, and real moderators. If someone is in crisis, Open Circle shows help right away, including the 988 Suicide & Crisis Lifeline.

NO ADS, NO SELLING YOUR DATA
There are no ads, and we never sell your information. Delete your account at any time from inside the app.

Open Circle is in a small, invite-only pilot. Features may change as we learn together. Open Circle is not an emergency service. If you are in danger, call 911 or 988.
```

**Support URL:** `https://<Open Circle domain>/support`, or `https://<API host>/open-circle/support` until it has its own domain. The server serves both (`OPEN_CIRCLE_HOSTS`).
**Marketing URL** (optional): `https://<Open Circle domain>/`, or `https://<API host>/open-circle`
**Privacy Policy URL:** `https://<Open Circle domain>/privacy`, or `https://<API host>/open-circle/privacy`. Publish it only after review: save the final version as `docs/legal/open-circle/PRIVACY_POLICY.md`.
**Category:** Social Networking (primary), Lifestyle (secondary). Steve to confirm.
**Age rating:** the same answers as Prayer Tower (user content, social, messaging; 18+ in the terms). See [APP_PRIVACY_ANSWERS.md](APP_PRIVACY_ANSWERS.md).
**Copyright:** `2026 [LEGAL NAME OF OPERATOR]`

## App Review notes

```
Open Circle is an ad-free support community for adults (18+): members ask for support, lift each other up and share good news. It has no religious content. To review:
Sign in with the review account below (it has sample requests from staff test accounts).
- Post a request: tap "What's on your mind?" on the Support tab.
- Support someone: tap "Thinking of You" on any request. Promise: "Promise to Check In".
- Report: open a request, tap "Report this request". Block: open a person, tap "Block".
- Delete account: Me > Delete my account (type DELETE).
User content is moderated: an automated safety check, member reports, and human moderators with an appeals process. Crisis language shows the 988 Lifeline.
Tokens are earned by supporting others, cannot be cashed out, and have no monetary value.
Review account: [EMAIL] / [PASSWORD]  (create it by hand on the hosted project, in the Open Circle community; do not use the demo seed)
```

**If App Review asks about Guideline 4.3(a)** ("Don't create multiple Bundle IDs of the same app", [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)): Open Circle and Prayer Tower serve different audiences with different content. Open Circle members never see Prayer Tower's posts, and Open Circle has its own name, words, icon, community and rules. If Apple still treats them as one app, the fallback already exists: Open Circle is also a community inside the Prayer Tower app (Admin → Communities).

## TestFlight

**What to Test**
```
Thank you for testing Open Circle! Please try: posting a request, supporting others (Thinking of You and Promise to Check In), sending a private note, joining a group, RSVPing to a meet-up, and reporting anything that feels wrong. Tell us what was confusing or broken by replying to the TestFlight feedback or at [FEEDBACK EMAIL].
```

**Beta App Description**
```
Open Circle is a small, ad-free community for asking for support and lifting one another up. This pilot tests posting requests, Thinking of You, promises to check in, private notes, groups, meet-ups and safety tools.
```

## Icon

The placeholder icon is a circle of people with one open place, in teal and peach (`apps/mobile/assets/images/open-circle-icon.png`, drawn by `npm run brand -- --edition open-circle` from `scripts/branding/marks.mjs`). The website uses the same drawing. A designer should finalize it before review.

## Screenshots

Captured 2026-10-28 from the Open Circle web build with neutral sample content. They are in the project files at `store-screenshots/open-circle/`, in Apple's required sizes: iPhone 6.9" (1320 × 2868), iPhone 6.3" (1206 × 2622) and iPad 13" (2064 × 2752) ([screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)). The default upload is `sample-labeled/`, with a small "Sample content" badge, as for Prayer Tower. The members are fictional, which Guideline 2.3.9 asks for ("display fictional account information instead of data from a real person"). `capture-open-circle.mjs` in that folder recaptures them.
