# Open Circle: the ad-free, non-religious edition

Steve, 2026-10-28: "I REALLY want this to work as ad free social media too without the religious angle." He chose **Both**:

1. **A community in the same app.** Open Circle is a second community next to the default Christian feed.
2. **A separately branded app.** The same code, built with `EXPO_PUBLIC_EDITION=open-circle`, ships as its own app.

The tone is warm, everyday kindness ("secular goodness"). "Ted Lasso version" is only the internal code name. It never appears in the app, because it is Apple TV's trademark. "Open Circle" is a placeholder until Steve picks a name.

## What Open Circle members get

| Area | Behavior |
|---|---|
| Feed | Only Open Circle posts, and Open Circle members never see Christian-feed posts. New posts, groups, events and care requests stay inside the author's community. |
| Post types | Request, Good News, Kind Thoughts and Story. Confessional posts are refused. |
| Wording | No religious words anywhere a member looks. "Praying Now" becomes **Thinking of You**, "Commit to Pray" becomes **Promise to Check In**, the Prayers tab becomes **Support**, and Priestly tokens become **Lighthouse tokens**. The tiers become Kindness Scout, Kind Helper and Kindness Champion. Pastors are mentors, and prayer partners are listening partners. |
| Notices and reminders | Neutral push and in-app notices, and neutral firm or gentle check-in reminders. |
| Hidden | Scripture leaves on the Vine feed, and the church application on Me. |
| Same as everyone | Tokens (earned only, never bought), moderation, crisis lines, blocking, no ads. |

Staff and admin screens keep the shared wording.

## Turning it on

The Open Circle community is **off by default**.

1. In **Admin → Communities**, switch on Open Circle.
2. Members then see a **Community** chooser on Me, and switching changes their feed and wording straight away.
3. Switching it off hides it from new members. Current members stay in it.

The default community cannot be switched off.

## The branded app

Set `EXPO_PUBLIC_EDITION=open-circle` for the build. That build gets:

| Setting | Value |
|---|---|
| App name | Open Circle |
| Bundle ID | `com.zoomatech.opencircle` |
| Link scheme | `opencircle://` |
| Icon | `assets/images/open-circle-icon.png` if that file exists, else the Prayer Tower icon |

In that build:
- The wording is always neutral, and there is no community chooser.
- New sign-ups ask to join Open Circle. Open Circle must be switched on in Admin first, or new members land in the default community.

The branded app shares the server and database with Prayer Tower. Its App Store listing, screenshots and EAS project are separate. Those are the items in STEVE_TODO.

## Where the code is

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029002200_open_circle_community.sql`: the community, placing new rows in the author's community, and the sign-up `community` choice |
| Server | `apps/server/src/modules/communities/`, the neutral notice catalog in `notifications/i18n.ts`, and the neutral reminder lines in `prompts/index.ts` |
| App wording | `apps/mobile/src/locales/neutral.ts`, which `lib/i18n.tsx` uses when the member's community is "secular" |
| Branded build | `apps/mobile/app.config.js` |

**Rule for new features:** put every religious word in `en.ts` and give it a neutral line in `neutral.ts`. The `open-circle` test fails if neutral text contains a religious word, or overrides a key that English doesn't have.
