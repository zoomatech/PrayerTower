# Prayer Tower

Prayer-first social platform. One repo (npm workspaces) holds the V1 backend and the mobile app. The backend is a **modular monolith** (one TypeScript codebase, one Postgres database) on **Supabase** (Postgres, Auth, Storage), with a stateless API and a Postgres-backed job worker. It runs on one machine and scales out by adding API/worker copies.

Design docs: `Prayer_Tower_V1_Architecture.md` and `Prayer_Tower_Product_Roadmap.md` (project files).

## Run it locally

Needs Node 22+ and Docker.

```bash
npm install
npm run db:start      # local Supabase in Docker; applies supabase/migrations
cp apps/server/.env.example apps/server/.env  # add SUPABASE_SECRET_KEY from `npx supabase status` for media uploads
npm run dev:api       # http://localhost:3000
npm run dev:worker    # background jobs + reminder cron
npm test              # integration tests against the local database
```

### Mobile app (Expo)

```bash
cp apps/mobile/.env.example apps/mobile/.env  # add the publishable key from `npx supabase status`
npm run dev:mobile    # Expo dev server: press i / a / w, or scan the QR code with Expo Go
```

On a phone, set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` to your computer's LAN address, not localhost. For a browser build, list its origin in the server's `CORS_ORIGINS`.

The iOS build targets iPhone, iPad and Mac (Designed for iPad, Apple silicon). Expo generates the Xcode project, so these live in `apps/mobile/app.json` (`ios.supportsTablet`) and `apps/mobile/plugins/with-mac-designed-for-ipad.js`, not in `ios/`. On a Mac with Xcode:

```bash
cd apps/mobile
npx expo prebuild -p ios   # writes ios/ (git-ignored)
xed ios                    # open in Xcode; pick an iPhone, iPad or "My Mac (Designed for iPad)"
```

Make yourself the first admin after signing up: `npm run grant-role -- you@example.com admin`.

`npm run db:reset` rebuilds the database from migrations. Add a migration with `npx supabase migration new <name>`.

### One machine with Docker Compose

```bash
docker compose up --build    # api on :3000 + worker, using apps/server/.env
docker compose up --scale worker=2
```

Point `DATABASE_URL` and `SUPABASE_URL` at self-hosted Supabase on the same machine, or at Supabase Cloud.

## Layout

```
supabase/migrations/               schema, one file per area (foundation, posts, prayer, ledger, notifications/moderation, lockdown, tiers, communities)
apps/server/src/app.ts             Fastify app: auth hook, CORS, error mapping, module routes
apps/server/src/server.ts          API process
apps/server/src/worker.ts          Graphile Worker process (tasks in src/tasks.ts, cron in crontab)
apps/server/src/modules/<name>/    index.ts = the module's public functions; routes.ts = its HTTP routes
apps/server/test/                  vitest integration + unit tests
apps/mobile/src/app/               Expo Router screens (sign-in, onboarding, tabs, compose, post detail)
apps/mobile/src/layouts/           feed layouts, chosen by the feed theme (V1: column)
packages/shared/                   types and constants shared by server and app
```

Modules: `accounts`, `posts`, `feed`, `prayer-actions`, `commitments`, `prompts`, `tiers`, `tokens`, `notifications`, `moderation`, plus `admin` routes. Modules call each other only through `index.ts` exports.

## Rules the code enforces

- **Server-only data access.** Every table has RLS on with no policies, and Supabase client roles have no grants, so the auto-generated Data API can't read or write app data. Clients use Supabase Auth to sign in, then call this API with the access token.
- **Auth.** The API verifies Supabase access tokens against the project's JWKS (`/auth/v1/.well-known/jwks.json`, ES256). A profile row is created for each new auth user by a database trigger. Suspended members can read but not write.
- **IDs.** UUIDv7 everywhere (`public.uuid_v7()`), time-sortable with a random suffix.
- **Token ledger.** Append-only double-entry transfers (`token_transfers`, updates/deletes blocked by trigger). The only write path is `post_token_transfer()`: idempotency keys, account row locks in a fixed order, and a no-negative-balance check. Clawbacks are new reversing transfers, at most one per transfer. `token_ledger_audit` must always be empty.
- **Anonymity.** The author is always stored; "Anonymous" is applied when presenting to anyone but that person.
- **Slow work goes on the queue,** in the same transaction as the triggering write: token credit and "praying right now" alerts, push, AI moderation scans, reminders.
- **Moderation.** AI (OpenAI `omni-moderation-latest`, optional) only flags; it auto-hides only severe categories pending review. Removal, token forfeiture, clawback and suspension happen only by a moderator decision and are logged in `moderation_actions`.
- **Tiers.** Prayer Scout → Prayerful Helper → Prayer Warrior by lifetime prayer events, thresholds set by an admin. Anonymous posts and anonymous members show a tier only to themselves. A weekly cron credits each tier's allotment, once per ISO week.
- **Prompts.** "When was the last time you prayed for ___?" points at the commitment gone longest without prayer, else an unprayed request from someone followed. Capped at one per 12 hours (members can lengthen or turn off) and two per day, no repeat post within 3 days.
- **Feed.** Fan-out on read. All ranking weights live in `apps/server/src/modules/feed/index.ts` (`weights`, `score`). Commitments outrank taps; tokens can raise a request but ranking never removes one. The first post is the newest prayer request or thanksgiving. Posts marked sensitive are hidden from members who opted out of trauma content.

- **Communities.** Every post and its children carry a `community_id` (copied by trigger from the post). V1 seeds one community, `christian-ecumenical`, and every new member joins it. Feeds only show the viewer's communities. Roles and tier settings can be scoped to one community (null = platform-wide).
- **Feed themes.** The feed returns a `theme` with a `layout` (`column`, `vine`, `carousel`, `flip`) and cards that carry no layout data, so a layout can be added in the app (`apps/mobile/src/layouts/index.tsx`) without server changes. Unknown layouts fall back to `column`.

## API (all routes need `Authorization: Bearer <supabase access token>` except `/health`)

| Area | Routes |
|---|---|
| Accounts | `GET/PATCH /me`, `GET /people/:id`, `PUT/DELETE /people/:id/follow`, `GET /me/followers`, `GET /me/following` |
| Posts | `POST /posts`, `GET /posts/:id`, `POST /posts/:id/answered`, `GET/POST /posts/:id/comments`, `POST /posts/:id/reactions`, `GET /posts/:id/prayers`, `POST /posts/:id/thanks`, `POST /media/upload-url` |
| Feed | `GET /feed?page=&pageSize=` |
| Prayer | `POST /posts/:id/praying-now`, `POST /posts/:id/commitments`, `GET /me/commitments`, `GET /me/commitments/review`, `POST /commitments/:id/check-in`, `POST /commitments/:id/snooze`, `PATCH /commitments/:id` |
| Prompts | `GET /me/prompt`, `POST /me/prompts/:id/response` |
| Tiers | `GET /me/tier` |
| Admin | `GET/PUT/DELETE /admin/people/:id/roles/:role`, `GET /admin/tiers`, `PATCH /admin/tiers/:tier`, `GET /admin/metrics?days=` |
| Tokens | `GET /me/tokens`, `POST /tokens/gift`, `POST /posts/:id/boost` |
| Notifications | `GET /me/notifications`, `POST /me/notifications/read`, `POST /me/push-tokens` |
| Moderation | `POST /reports`, `GET /moderation/queue`, `POST /moderation/items/:id/decision` |

## Open product values (placeholders in code)

- Preview length before "more": 200 characters (`apps/server/src/config.ts`; 200 vs 220 undecided).
- Tokens per Praying Now / check-in: 1, at most once per post (or commitment) per UTC day.
- Tier thresholds and weekly allotments: `tier_settings` rows ship with nulls until decided (set with `PATCH /admin/tiers/:tier`). "Maintain status by using credits" is not built until the rule is defined.
- Prompt caps: 12 hours apart, 2 per day (`apps/server/src/config.ts`).
