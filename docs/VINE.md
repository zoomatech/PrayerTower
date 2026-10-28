# Vine 2.0 feed style

The Vine is a feed style members can pick in **Me → Feed style**. It is out of beta (2026-10-28). The Classic column stays every community's default.

## What members see

| Part | Behavior |
|---|---|
| Stem and fruit | Each request hangs as fruit on one stem. Its ripeness says where it stands: waiting for prayer, being prayed over, sent out by radio, or answered. |
| Tendrils | One ➰ for each person who promised to pray (up to 5, then "+N"). Your own promise is drawn in the tendril color and labeled "Your tendril". |
| Bloom | An answered request gets a gold glow and "🌸 Answered". |
| Scripture leaves | A short verse every few fruit, from the member's community. Open Circle members get none. |
| The bird | After a pause, a bird snips an ad bud and says there are no ads here. Once per visit, and not at all with Reduce Motion on. |
| Tip of the vine | At the end of the feed, a resting message and a "See if it has grown" button that refreshes. |
| Your branch | Me → See your branch shows only your own requests (latest 100) on the vine, with their tendrils and blooms. |

Open Circle members get neutral words (for example "promised to check in", "Worked out"), from `locales/neutral.ts`.

## Where the code is

| Part | Location |
|---|---|
| Release | `supabase/migrations/20261029002900_vine_release.sql`: Vine status `active`; Open Circle gets the Column, Vine, Flip and Swipe styles |
| Server | `GET /me/branch` in `apps/server/src/modules/feed/routes.ts` |
| App | `apps/mobile/src/layouts/vine.tsx` and `apps/mobile/src/app/branch.tsx` |
| Tests | `apps/server/test/vine-branch.test.ts`, `apps/mobile/src/__tests__/branch.test.tsx` |

Colors, the leaf spacing, the bird's delay and its text come from the theme's `tokens` column in `public.feed_themes`. There is no admin screen for them yet; a database change sets them.
