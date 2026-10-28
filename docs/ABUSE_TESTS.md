# Abuse tests: spam, flooding and token farming

`apps/server/test/abuse.test.ts` scripts these attacks against the API. They run in CI with every other server test. Each attack below was written to break the server, and each one is now stopped. Admins can change every limit in **Admin → New members** and **Admin → Tokens**.

| # | Attack (scripted) | Before | Now |
|---|---|---|---|
| 1 | An established member posts 15 requests in a row | All 15 went up. Only new members had a daily cap; everyone else had just the API limit of 300 requests a minute. | **10 requests an hour** for everyone (`posts_per_hour`), then "please wait" (429). |
| 2 | The same request posted again, in different case and spacing | Accepted | Refused for a day (409 `duplicate`). Other people can still use the same words. Since 2026-10-28 other punctuation and invisible characters don't make it new either (see the staging run below). |
| 3 | 62 comments on one request in a minute, then the same comment twice | All accepted | **60 comments an hour** (`comments_per_hour`), and no duplicate comment in a day. |
| 4 | 25 messages in a row in one conversation | All accepted | **20 messages a minute** (`messages_per_minute`). |
| 5 | Reporting the same request 10 times | Already stopped: 1 report | 1 report per member per item (unchanged). |
| 6 | Tapping "praying now" 20 times on one request, and on one's own request | Already stopped: 1 token, and none for your own request | 1 regular token per request per UTC day, never for your own (unchanged). |
| 7 | A script taps one request every 61 seconds for an hour | **60 verified prayers, which is 6 Priestly tokens an hour** (about 144 a day), because the only check was the 60-second gap | **1 verified prayer per request per UTC day** |
| 8 | A ring of 6 accounts posts 60 requests, and a farmer prays each one once, 61 seconds apart | 60 verified prayers (6 Priestly tokens) | **At most 50 verified prayers a day per member** (`verified_prayers_per_day`), so at most 5 Priestly tokens a day |
| 9 | 10 gifts of 1 token sent at the same moment with a balance of 3, plus a replayed gift, a gift to yourself, and negative or fractional amounts | Already stopped | Exactly 3 gifts go through and the balance never goes below 0. The replay moves tokens once. The rest are refused. |
| 10 | A moderator posts 12 notes quickly | n/a | Allowed. Admins and moderators are exempt from the flood limits. |

## Staging run (2026-10-28)

Every attack above was run again end to end on the staging stack: the production build of the API and worker in production mode, members signed in through Supabase Auth, every request over HTTP, and tokens paid by the real worker. The only shortcut: attacks 7 and 8 need an hour of taps 61 seconds apart, so those taps were written into the database with past times, and their Priestly tokens were credited the way the worker does after a tap. Members were set up as established (30 days old, 5 prayers for others), since staging has the new-member limits on.

| # | Result on staging |
|---|---|
| 1 | 10 accepted, then 5 × 429 |
| 2 | **Failed at first.** "…this week!" and the same words with a zero-width space were accepted as new. **Fixed:** the duplicate check now compares letters and digits only, in lower case. Text with no letters (only emoji) is compared as typed, so 🙏 and ❤️ are still different comments. After the fix: all four variants 409; another member 201. |
| 3 | 60 accepted, then 2 × 429; a repeated comment, re-cased, 409 |
| 4 | 19 accepted, then 429 |
| 5 | 10 reports, 1 moderation item |
| 6 | The tapper earned 1 token; the poster 0 |
| 7 | 1 verified prayer; 0 Priestly tokens |
| 8 | 50 verified prayers; 5 Priestly tokens |
| 9 | 3 tokens earned by praying; 3 of 10 parallel gifts went through (7 × 409); balance 0; the replay moved 1 token once; self, −5 and 0.5 refused (400) |
| 10 | 12 accepted |

The token ledger check (`token_ledger_audit`) found no problems afterwards.

## Where the fixes are

- **Migration `20261029000300_abuse_limits.sql`:**
  - adds `token_settings.verified_prayers_per_day` (default 50)
  - adds `safety_settings.posts_per_hour` (10), `comments_per_hour` (60) and `messages_per_minute` (20)
  - rewrites `prayer_events_verify()`. A prayer is verified only when it is for someone else's request, at least the minimum gap after the member's last prayer, the member's first verified prayer for that request that UTC day, and under the daily cap.
- **`safety.checkFlood()`** enforces the caps for requests, comments and messages, and the duplicate check for requests and comments. It runs on top of the new-member limits, which still apply to new members.

## Still worth knowing

- **Fake accounts** are mostly kept out by invite-only sign-up (INVITES.md). Automated-tap flags (Admin → Moderation) catch metronome-like tapping. Moderators can claw back tokens earned by a bot.
- **The defaults are guesses for a 10-person pilot.** A busy prayer leader may need more than 10 requests an hour. Raise the limit in Admin → New members, or make the person a moderator.
