# Store listing copy (draft)

App Store only: the pilot is iPhone only. The Google Play text is archived in [archive/GOOGLE_PLAY_DRAFTS.md](../archive/GOOGLE_PLAY_DRAFTS.md).

> Drafted 2026-10-28 for the pilot, for Steve to edit. Character counts are checked against each field's limit. App Store limits: Promotional Text 170 characters, Description 4,000, Keywords 100 bytes ([Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). App name and subtitle are 30 characters each; check these in App Store Connect.
>
> `eas metadata:push` uploads this file's App name, Subtitle, Promotional text, Keywords, Description and App Review notes (apps/mobile/store.config.js, steps in [TESTFLIGHT_EAS_GUIDE.md](../TESTFLIGHT_EAS_GUIDE.md)). Keep each in its code block under the same bold label. The app's tests fail if a field goes over Apple's limit.
>
> Keep the listing honest about the pilot. Don't promise radio prayers or features that are switched off when the build goes in for review.

## Apple App Store

**App name** (12/30)
```
Prayer Tower
```

**Subtitle** (20/30)
```
Pray for one another
```

**Promotional text** (151/170). You can change this without a new build.
```
Post a prayer request in seconds and know real people are praying. Pray for others, keep your prayer promises, and gather for prayer meetings near you.
```

**Keywords** (98/100 bytes). Don't repeat words from the app name, because Apple already indexes those.
```
intercession,church,christian,faith,bible,devotional,ministry,jesus,praise,petition,community,hope
```

**Description**
```
Prayer Tower is a quiet, caring place to ask for prayer and to pray for others.

ASK FOR PRAYER
Share what's on your heart in a few words: an illness, a job, a family need, a praise. Post with your name or anonymously. You'll see when people are praying for you, and you can thank them.

PRAY FOR OTHERS
Read real requests from real people and tap "Praying Now" when you pray. Promise to keep praying daily or weekly, and Prayer Tower will gently remind you. Write a private note to say you prayed.

PRAY TOGETHER
Join prayer groups, message the people you pray with, and find prayer meetings and meet-ups, in person or by video. Ask for a prayer partner or a pastor when you'd rather not carry something alone.

A SAFE COMMUNITY
Clear community rules, reporting and blocking, and real moderators. If someone is in crisis, Prayer Tower shows help right away, including the 988 Suicide & Crisis Lifeline.

NO ADS, NO SELLING YOUR DATA
There are no ads, and we never sell your information. Delete your account at any time from inside the app.

Prayer Tower is in a small, invite-only pilot. Features may change as we learn together. Prayer Tower is not an emergency service. If you are in danger, call 911 or 988.
```

**Support URL:** `https://<API host>/support`. The server serves it, and Apple requires published contact information for apps with user content.
**Marketing URL** (optional): `https://<API host>/`, the landing page
**Privacy Policy URL:** `https://<API host>/privacy`. Publish it only after review: save the final version as `docs/legal/PRIVACY_POLICY.md`.
**Category:** Lifestyle (primary), Social Networking (secondary). Steve to confirm.
**Copyright:** `2026 [LEGAL NAME OF OPERATOR]`

**App Review notes.** Use the fuller version in [REVIEW_NOTES.md](REVIEW_NOTES.md), which also has the review account plan and answers to likely questions. Short version:
```
Prayer Tower is a prayer-request community for adults (18+). To review:
Sign in with the review account below (it has sample requests from staff test accounts).
- Post a request: tap "Type your prayer here".
- Pray: tap "Praying Now" on any request. Commit: "Commit to Pray".
- Report: open a request, tap "Report this request". Block: open a person, tap "Block".
- Delete account: Me > Delete my account (type DELETE).
User content is moderated: an automated safety check, member reports, and human moderators with an appeals process. Crisis language shows the 988 Lifeline.
Tokens are earned by praying, cannot be bought or cashed out, and have no monetary value.
Review account: [EMAIL] / [PASSWORD]  (create it by hand on the hosted project; do not use the demo seed)
```

**What to Test** (TestFlight)
```
Thank you for testing Prayer Tower! Please try: posting a request, praying for others (Praying Now and Commit to Pray), sending a private note, joining a group, RSVPing to an event, and reporting anything that feels wrong. Tell us what was confusing or broken by replying to the TestFlight feedback or at [FEEDBACK EMAIL].
```

**Beta App Description** (TestFlight external testing)
```
Prayer Tower is a small community for asking for prayer and praying for one another. This pilot tests posting requests, praying, prayer promises, private notes, groups, events and safety tools.
```

## Native builds

The native SwiftUI apps ([NATIVE_TESTFLIGHT.md](../NATIVE_TESTFLIGHT.md)) are separate App Store
Connect records with their own bundle IDs: `com.zoomatech.prayertower.native` (Prayer Tower) and
`com.zoomatech.opencircle.native` (Open Circle). They use the same listing text as above, and the
Open Circle text in [open-circle/STORE_LISTING.md](open-circle/STORE_LISTING.md). The privacy
answers ([APP_PRIVACY_ANSWERS.md](APP_PRIVACY_ANSWERS.md)) and the TestFlight text
([TESTFLIGHT_TEST_INFO.md](TESTFLIGHT_TEST_INFO.md)) are the same too. The `eas metadata:push` upload
covers only the Expo app, so paste this text into the native records by hand. What's different:

- **Version:** 0.1.0 by default (`PT_VERSION`). Build numbers count up by themselves.
- **Extras in the binary:** the Pray now widget and Lock Screen Live Activity, and the
  cross-posting Safari extension, which members turn on in Settings → Safari → Extensions. Add one
  line to What to Test: "Turn on the cross-posting extension in Safari settings and post on
  facebook.com or threads.com".
- **Screenshots:** the Expo screenshots show the same screens and can be used until native ones
  are taken.

## Screenshots

The current set is in the project files at `store-screenshots/` (and `store-screenshots.zip`), recaptured 2026-10-28 from the English-only build: iPhone 6.3" (1206 × 2622, required), iPhone 6.9" (1320 × 2868) and iPad 13" (2064 × 2752, required because the app runs on iPad). Sizes follow Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications). The eight screens are: feed, Praying Now, Commit to Pray, a request with comments, My Promises, a private message, tokens and profile, and events.

They use the fictional local demo members (Carol, Ruth, James, Ethel) with the "Demo" labels removed. Apple allows this: Guideline 2.3.9 says "you should display fictional account information instead of data from a real person", and 2.3.3 allows text overlays that leave the app in use visible ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [2.3.3 reference](https://developer.apple.com/help/app-review/guideline-reference/2-3-3-screenshots)). The default upload is `store-screenshots/sample-labeled/`, which adds a small "Sample content" badge in line with the 2026-09-19 decision against showing made-up member content publicly. The unlabeled set is kept. `capture.mjs` in that folder makes either (`SAMPLE_LABEL="Sample content"`).
