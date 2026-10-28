# Store listing copy (draft)

> Drafted 2026-10-28 for the pilot, for Steve to edit. Character counts are checked against each field's limit. App Store limits: Promotional Text 170 characters, Description 4,000, Keywords 100 bytes ([Apple](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)). App name and subtitle are 30 characters each; check these in App Store Connect. Google Play limits: title 30, short description 80, full description 4,000. Google also bans ranking claims, prices or promotions, unattributed testimonials and keyword lists in these fields ([Google Play](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)).
>
> Keep both listings honest about the pilot. Don't promise radio prayers or features that are switched off when the build goes in for review.

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

Prayer Tower is in a small pilot. Features may change as we learn together. Prayer Tower is not an emergency service. If you are in danger, call 911 or 988.
```

**Support URL:** `https://<API host>/support`. The server serves it, and Apple requires published contact information for apps with user content.
**Marketing URL** (optional): `https://<API host>/`, the landing page
**Privacy Policy URL:** `https://<API host>/privacy`. Publish it only after review: save the final version as `docs/legal/PRIVACY_POLICY.md`.
**Category:** Lifestyle (primary), Social Networking (secondary). Steve to confirm.
**Copyright:** `2026 [LEGAL NAME OF OPERATOR]`

**App Review notes.** Use the fuller version in [REVIEW_NOTES.md](REVIEW_NOTES.md), which also has the review account plan, Play's App access text and answers to likely questions. Short version:
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

## Google Play

**App name** (27/30). Google bans promotional words such as "Free" or "No Ads" in titles.
```
Prayer Tower: Pray Together
```

**Short description** (64/80)
```
Ask for prayer, pray for others, and keep your promises to pray.
```

**Full description.** Same as the App Store description, minus the "NO ADS" heading, because Google bans promotional claims in descriptions:
```
Prayer Tower is a quiet, caring place to ask for prayer and to pray for others.

ASK FOR PRAYER
Share what's on your heart in a few words: an illness, a job, a family need, a praise. Post with your name or anonymously. You'll see when people are praying for you, and you can thank them.

PRAY FOR OTHERS
Read real requests from real people and tap "Praying Now" when you pray. Promise to keep praying daily or weekly, and Prayer Tower will gently remind you. Write a private note to say you prayed.

PRAY TOGETHER
Join prayer groups, message the people you pray with, and find prayer meetings and meet-ups, in person or by video. Ask for a prayer partner or a pastor when you'd rather not carry something alone.

A SAFE COMMUNITY
Clear community rules, reporting and blocking, and real moderators. If someone is in crisis, Prayer Tower shows help right away, including the 988 Suicide & Crisis Lifeline. You can delete your account at any time from inside the app.

Prayer Tower is in a small pilot. Features may change as we learn together. Prayer Tower is not an emergency service. If you are in danger, call 911 or 988.
```

**Category:** Lifestyle. **Tags:** Faith, Community. Choose them in the Play Console tag picker.
**Contact email:** [SUPPORT EMAIL] (required) · **Website:** `https://<API host>/` · **Privacy policy:** `https://<API host>/privacy`

## Screenshots to capture (both stores)

The browser screenshots in `build/screenshots/` show the flows. Take store screenshots on a real device or simulator at the required sizes:
1. The feed: "Welcome, … Let's talk to the Lord" and requests.
2. Posting a request.
3. Praying Now and Commit to Pray.
4. A private note and its reply.
5. Groups and events.
6. Safety: report, block and the 988 banner.

Use staff test accounts with content written by staff, not the demo seed. The 2026-09-19 decision says no fabricated member content is shown publicly. Label sample screenshots "Sample content" if counsel advises.
