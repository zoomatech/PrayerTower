# Database query audit (1,000 members)

On 2026-10-28 we ran `EXPLAIN ANALYZE` on the 20 queries that cost the most at 1,000 members, and fixed the slow ones. The script that does this, and that anyone can run again, is `npm run query-audit -w @prayer-tower/server`. Its full output, with every plan, is in [QUERY_AUDIT_RESULTS.md](QUERY_AUDIT_RESULTS.md).

## How it was measured

1. **Seed (local only).** The script refuses any database that isn't on this machine. It adds 1,000 members, each with:
   - 5 prayer requests spread over 60 days
   - 30 follows
   - 60 notifications
   
   Each request gets 20 prayers and 2 comments, which comes to about 100,000 prayer events. There are also 500 direct conversations of 20 messages each.
2. **Real traffic.** The API runs in-process. 50 members each open 26 screens for 3 rounds: the feed (pages 1 and 2), Me, notifications, tokens, tier, conversations, commitments, followers and following, the prayer prompt, events, highlights, announcements, groups, a request with its comments and prayers, a "praying now" tap, a profile, and the weekly digest. An admin opens the admin screens, the moderation queue and the ledger check.
3. **Every statement is recorded,** about 20,000 from 68 distinct queries. They are grouped by query text, ranked by total time, and the top 20 are explained with real parameters. Writes run inside a transaction that is rolled back.
4. **Clean up.** The script then deletes the 1,000 members. Pass `--keep` to leave them in place.

## What was slow, and the fix

The three new indexes are in migration `20261029000100_query_audit_indexes.sql`. Times are the mean per call on a local machine, measured on the same data before and after.

| Query (screen) | Before | After | Cause | Fix |
|---|---|---|---|---|
| Weekly pilot report (Admin → Pilot report, sponsor email) | 328 ms | 33 ms | 12 weeks × 10 counts, each a full scan of prayer events and posts | `prayer_events_recent_idx`, `posts_requests_recent_idx`, `posts_answered_idx` |
| "Most prayed for this week" (Highlights) | 19.2 ms | 8.0 ms | Full scan of all prayer events to find the last 7 days | `prayer_events_recent_idx (created_at desc) include (post_id, user_id, kind)` |
| Prayer warriors of the week (Highlights, Admin) | 16.6 ms | 5.2 ms | Same full scan | Same index |
| "Answered this week" (Highlights) | full scan of posts | index scan | No index on `answered_at` | `posts_answered_idx` (partial, only answered posts) |

## What is fine as it is

- **The feed (8 ms, the most-run query).** It reads the last 30 days of visible requests and ranks up to 500 candidates. Postgres reads the posts table straight through, which is the faster choice here: half of the seeded posts fall inside the 30 days. The per-post counts (commitments, taps, reach) use indexes. The two that show sequential scans read tables of 10 and 85 rows, where a scan is cheaper than an index. Look at this again past about 50,000 posts.
- **Everything else in the top 20** takes under 1.6 ms. Most of them are primary-key lookups, such as the profile, the suspension check (once per request), and settings rows.
- **The admin top-pray-ers list (13 ms) and the ledger check** run only on admin screens or nightly.

## Running it again

```
npm run db:start
npx supabase migration up --local
npm run query-audit -w @prayer-tower/server
```

Set `AUDIT_MEMBERS` (default 1,000) and `AUDIT_ROUNDS` (default 3) for other sizes. Re-run it after a big feature, and before the pilot grows past a few hundred members. Never point it at the hosted project. It checks for that and stops.
