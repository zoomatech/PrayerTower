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
| Hidden | Scripture leaves on the Vine feed, the church application on Me, and the AI conversation with God (refused for Open Circle members). |
| Icons | 🤝 instead of 🙏 on the My Promises tab, the commit button, the tour and the "people have supported you" line. |
| Same as everyone | Tokens (earned only, never bought), moderation, crisis lines, blocking, no ads. |

Staff and admin screens keep the shared wording.

### Server-side safety net

The app's wording covers what members see in the app. The server also catches text it writes itself:

- **Notices and push:** every notice to an Open Circle member passes through `neutralText()` (`communities/neutral-text.ts`) after its template, so a notice without a neutral template still reads "support" instead of "prayer".
- **Errors:** an error message with a religious word is neutralized for Open Circle members.
- **Emails:** the weekly digest and invite emails have their own neutral text.
- **Weekly review** on My Promises has its own neutral lines.

### No leaks between communities

Highlights, the Prayer Cast log and totals, featured macro needs and shown help stories are all scoped to the viewer's community, like the feed.

## Hiding features per community

In **Admin → Communities**, each community has a row of feature chips. Tap one to hide it there. Its buttons leave the app, and the server refuses it (`requireFeature`). Nothing is hidden by default.

| Chip | What it hides |
|---|---|
| Radio and Amplify | Send by radio, Amplify, Prayer Cast |
| Spoken messages | Spoken prayers on a request |
| Care requests | Talk with someone now |
| Events | Meetings & events |
| Groups | Groups |
| Awards | Accepting an award |
| Live video | Live now, and starting a room |
| AI circle prep | Prepare for a circle, and circle requests |
| Pools | Token pools |
| Highlights | This week's highlights |

## Inviting people straight into Open Circle

In **Admin → Invites**, pick the community a new member joins before creating codes. A code for Open Circle puts the new member there at sign-up, and its invite email uses neutral wording. Each code shows "Joins Open Circle".

## Checking it

`apps/e2e/tests/18-open-circle.spec.ts` signs in as an Open Circle member, posts, and visits 26 member screens. It fails if any screen shows a religious word. The 2026-10-28 walk's screenshots are in `/mnt/project-files/screenshots/open-circle-walk/`.

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
| Database | `supabase/migrations/20261029002200_open_circle_community.sql`: the community, placing new rows in the author's community, and the sign-up `community` choice. `20261029004200_open_circle_complete.sql`: hidden features and invite codes for a community |
| Server | `apps/server/src/modules/communities/`, the neutral notice catalog in `notifications/i18n.ts`, and the neutral reminder lines in `prompts/index.ts` |
| App wording | `apps/mobile/src/locales/neutral.ts`, which `lib/i18n.tsx` uses when the member's community is "secular" |
| Branded build | `apps/mobile/app.config.js` |

**Rule for new features:** put every religious word in `en.ts` and give it a neutral line in `neutral.ts`. The `open-circle` test fails if neutral text contains a religious word, or overrides a key that English doesn't have.
