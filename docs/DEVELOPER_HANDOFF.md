# Prayer Tower developer handoff

This is for anyone picking up the code, whether a person or another AI assistant: Steve, ChatGPT or Claude. It covers what the system is, how the parts connect, how to run it, how to add a feature, and every switch and its default. It was refreshed on 2026-10-28, with main at PR #39. Every doc is listed by audience in [README.md](README.md), and the API is described in [API.md](API.md).

**Ground rules**
- Read the current files before you change them, because several people and assistants edit this repo.
- Work on a branch and open a PR. CI must be green before you merge.
- Never put secrets in the repo or in `EXPO_PUBLIC_` variables.
- Never run `npm run seed:demo` against the hosted database. It creates labeled fake members, and it is only for local machines.

## 1. What it is

Prayer Tower is a prayer-first social app. Members post requests and tap **Praying Now** when they pray. They **commit** to pray regularly and get reminders, and they earn **tokens**. Tokens can never be bought or cashed out. Members can spend them to extend a request's reach or send it out by radio. V1 is one ecumenical Christian community, an iPhone-only pilot of about 10 testers. The data model already allows more communities.

Product docs live in the project files: `roadmap/Prayer_Tower_Product_Roadmap.md` and `roadmap/Prayer_Tower_V1_Architecture.md`.

## 2. The repo

npm workspaces, Node 22 or newer.

```
apps/server     Fastify API + Graphile Worker (TypeScript, ESM). The only thing that touches the database.
apps/mobile     Expo SDK 58 / Expo Router app (iPhone; the web build is used for e2e tests and previews).
apps/station    Radio station worker (Raspberry Pi/laptop + fldigi), see docs/RADIO_STATION.md.
apps/e2e        Playwright end-to-end tests against the web build of the app.
packages/shared Types, labels and constants used by both server and app (e.g. CRISIS_LINES, POST_TYPES).
supabase/       Database migrations (one file per change, applied in order) and local Supabase config.
docs/           Deploy, TestFlight, branding, security review, legal drafts, store answers, this file.
scripts/        Icon/splash renderer (npm run brand).
```

## 3. How the parts connect

```
iPhone app ──(1) sign in──► Supabase Auth
     │
     └──(2) every call, Bearer <access token>──► API (Fastify, apps/server/src/app.ts)
                                                  │  verifies the token against Supabase JWKS
                                                  │  module routes → module index.ts functions → Postgres
                                                  │  slow work → job row in the same transaction
                                                  ▼
                                               Postgres (Supabase) ◄── Worker (Graphile Worker): push, AI scan,
                                                  ▲                     reminders, token credit, radio, cron
Radio station (apps/station) ──x-station-key──────┘ (via API /station/*)
Public website (/, /support, /privacy, /terms, /account-deletion) is served by the same API process.
```

- **Data access is server-only.** Every table has row-level security on with no policies, and the Supabase client roles have no grants. The Supabase Data API therefore can't read app data, and the app talks only to our API. `apps/server/test/security.test.ts` checks this, and it checks that every route needs sign-in.
- **Modules.** Each one lives in `apps/server/src/modules/<name>/`. `index.ts` holds its functions, which take a `Queryable` (the pool or a transaction). `routes.ts` holds its HTTP routes. Modules call each other only through `index.ts`. They are:
  - accounts, posts, feed, prayer-actions, commitments, prompts, tiers, tokens
  - notifications, moderation, safety, activity, messages, events, care, witness
  - pools, reach, schedules, macro-needs, highlights, milestones, radio, future
  - feedback, site, deletion-page, admin
- **Wiring.** `apps/server/src/app.ts` registers every module's routes in one place, behind the auth hook. `src/tasks.ts` lists every background task and the cron schedule, in UTC.
- **Jobs.** A write that needs slow follow-up work calls `enqueue()` in the same transaction, so nothing is lost if the worker is down. The worker runs those jobs.
- **Tokens.** Tokens move only through the database function `post_token_transfer()`. The ledger is append-only and double-entry, with idempotency keys. `src/modules/tokens/index.ts` is the only TypeScript that calls it.
- **Anonymity** is applied when presenting data (`presentIdentity`). The author is always stored.
- **Blocking** works both ways. Use `posts.getActionable()` for any action on someone's request, and `messages.isBlocked()` for messages.
- **App structure.**
  - `src/app/` holds the screens, using Expo Router file routes.
  - `src/lib/api.ts` is the typed API client. It handles offline caching and the queue.
  - `src/lib/auth.tsx` holds the session and profile.
  - `src/components/` holds the UI.
  - `src/layouts/` holds the feed styles (column, vine, flip, carousel).
  - `src/lib/theme.ts` holds colors and type.

## 4. Run it locally

You need Docker Desktop, Node 22 or newer, and Xcode for the iPhone simulator.

```bash
git clone https://github.com/zoomatech/PrayerTower.git && cd PrayerTower
npm install
npm run db:start                                   # local Supabase in Docker, applies all migrations
cp apps/server/.env.example apps/server/.env       # add SUPABASE_SECRET_KEY from `npx supabase status` (media uploads)
cp apps/mobile/.env.example apps/mobile/.env       # add the publishable key from `npx supabase status`
npm run seed:demo                                  # local only: carol/ethel/james/ruth/pastor/admin @demo.prayertower.local, password praying-demo-1
npm run dev:api                                    # http://localhost:3000 (website at /)
npm run dev:worker                                 # background jobs and cron
npm run dev:mobile                                 # press i (iPhone simulator) or w (browser)
```

**Common tasks**

| Task | Command |
|---|---|
| Start over with a clean database | `npm run db:reset`, then `npm run seed:demo` |
| Make yourself admin | `npm run grant-role -- you@example.com admin` |
| Server tests (integration, real local DB) | `npm test` (about 130 tests) |
| Type check everything | `npm run typecheck` |
| End-to-end tests | `npm run build:web -w @prayer-tower/e2e`, then `npm run test:e2e` (17 tests, including accessibility; resets the DB) |
| Switch the app icon | `npm run brand -- tower` (or `cross` or `offering`) |
| Run on one machine | `docker compose up --build` |

On a real phone, set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_SUPABASE_URL` to your computer's LAN address. Deploying is covered in `docs/DEPLOY.md`, TestFlight in `docs/TESTFLIGHT_EAS_GUIDE.md`, and launch gates in `docs/PILOT_LAUNCH_CHECKLIST.md`.

## 5. How to add a feature

The feedback feature is a small, complete example to copy. It came in with PR #5.

1. **Database.** Run `npx supabase migration new <name>`.
   - Create tables with `id uuid primary key default public.uuid_v7()`.
   - Turn row-level security on, add **no** policies, and revoke access from `anon` and `authenticated`. Copy the lines from an existing migration.
   - If members can delete their account, add your table to `accounts.deleteAccount()`.
   - Run `npm run db:reset` to apply it.
2. **Module.** Create `apps/server/src/modules/<name>/index.ts`.
   - Validate input with zod schemas.
   - Write functions that take `(q: Queryable, userId, ...)`.
   - Throw `badRequest`, `forbidden`, `notFound` or `conflict` from `src/errors.ts`.
   - Anything slow goes through `enqueue()`.
3. **Routes.** Create `routes.ts`.
   - Call `requireUser(req)`.
   - Use `withTx(db, ...)` for multi-step writes.
   - Check staff routes with `accounts.hasRole(...)`.
   - Register the routes in `src/app.ts`. If a suspended member must still reach a route, add it to `SUSPENDED_ALLOWED` in `src/auth.ts`.
4. **Settings.** If an admin should be able to change a value, add a column to a `*_settings` table plus a `GET`/`PATCH /admin/...-settings` route, rather than a hard-coded number.
5. **Jobs.** Add the task to `src/tasks.ts`, and add a crontab line if it runs on a schedule.
6. **Shared types.** Add them to `packages/shared/src/index.ts`.
7. **App.**
   - Add an API method in `src/lib/api.ts`.
   - Add a screen in `src/app/<name>.tsx` and register it in `src/app/_layout.tsx` inside the signed-in `Stack.Protected` block.
   - Use the components in `src/components/ui.tsx`. They are already accessible: labels, roles, and 44-point touch targets.
8. **Tests.**
   - Add `apps/server/test/<name>.test.ts`, using `createUser`, `as(userId)` and `newRequest` from `test/helpers.ts`.
   - The security test picks up new routes automatically.
   - Add an e2e spec in `apps/e2e/tests/` for any user-facing flow.
9. **Docs.** If you collect new data, update the privacy policy draft (`docs/legal/`) and the App Store privacy answers (`docs/store/`).
10. **Ship.** Open a PR. CI runs typecheck and the server tests. Merge once it's green.

## 6. Switches and defaults

### Environment variables: server (`apps/server/.env`)

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | local Supabase | Postgres connection for API and worker |
| `DATABASE_POOL_MAX` | 10 | Connections per process; keep API + worker under the plan limit |
| `SUPABASE_URL` | local | Auth key set and Storage |
| `SUPABASE_SECRET_KEY` | unset | Needed for photo/video uploads (server only) |
| `SUPABASE_PUBLISHABLE_KEY` | unset | Turns on the public `/account-deletion` page |
| `SUPPORT_EMAIL` | unset | Contact shown on the website and deletion page |
| `PORT` | 3000 | API port |
| `CORS_ORIGINS` | any | Comma-separated browser origins; **set in production** |
| `RATE_LIMIT_PER_MINUTE` | 300 | Requests per member per minute (0 = off) |
| `MODERATION_PROVIDER` | `openai` | AI moderation: `openai`, `claude` or `off`. Off until that provider's key is set. |
| `OPENAI_API_KEY` | unset | Key for `MODERATION_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` | unset | Key for `MODERATION_PROVIDER=claude` |
| `MODERATION_CLAUDE_MODEL` | `claude-opus-5-5` | Claude model for moderation; `claude-haiku-5-5` costs far less per post |
| `RETENTION_REMOVED_DAYS` / `RETENTION_NOTIFICATION_DAYS` / `RETENTION_QUEUE_DAYS` | 90 / 90 / 30 | Data retention periods (see DEPLOY.md); 0 = keep |
| `STATION_API_KEY` | unset | Radio station key (24+ chars); unset = no station API |
| `PUSH_ENABLED` | 1 | 0 = write in-app notices but don't push |
| `EXPO_ACCESS_TOKEN` | unset | Only if Expo enhanced push security is on |
| `CRISIS_COUNTRY` | US | Crisis line in notices and on the site: US, CA, GB, IE |
| `SITE_LEGAL_DIR` | docs/legal | Where /privacy and /terms are read from |
| `APP_STORE_URL`, `PLAY_STORE_URL` | unset | Store buttons on the home page |
| `SENTRY_DSN` | unset | Crash reporting; unset = off |
| `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | `NODE_ENV`, unset, 0 | Sentry labels and tracing (0 = no traces) |
| `SMTP_URL`, `MAIL_FROM` | unset | Email for invites, the weekly digest and the sponsor report; unset = no email |
| `SPONSOR_REPORT_TO`, `SPONSOR_REPORT_LANG` | unset, en | Who gets the Monday pilot report, and its language (English while Spanish is off) |
| `SPANISH_ENABLED` | unset | `1` brings back Spanish notifications, emails and `/es` pages. Off: English only ([archive/LOCALIZATION.md](archive/LOCALIZATION.md)) |
| `WEB_APP_URL` | unset | Web app address; invite emails link to sign-up with the code filled in |
| `APPLE_TEAM_ID`, `APP_LINK_APP_IDS`, `ANDROID_CERT_SHA256` | unset, both bundle IDs, unset | Shared links that open the app (APP_LINKS.md) |
| `API_DOCS_PASSWORD` | unset | Basic-auth password (16+ chars) for `/api/docs` in production; staff tokens also work (API.md) |
| `METRICS_TOKEN` | unset | Enables `GET /metrics` (Prometheus) |
| `LOG_LEVEL` | info | Server log level |
| `WORKER_CONCURRENCY` | 5 | Jobs the worker runs at once |

### Environment variables: app (`apps/mobile/.env`)

These are bundled into the app, so **no secrets**.

| Variable | Default | What it does |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | http://localhost:3000 | The API |
| `EXPO_PUBLIC_SUPABASE_URL` | local | Sign-in |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | unset | Sign-in (safe to ship) |
| `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` | unset | Legal links on sign-up and Me |
| `EXPO_PUBLIC_SUPPORT_EMAIL` | unset | Shown on Rules and Feedback |
| `EXPO_PUBLIC_CRISIS_COUNTRY` | US | Crisis line on posts that mention self-harm |
| `EXPO_PUBLIC_SENTRY_DSN` | unset | Crash reporting; unset = off |
| `EXPO_PUBLIC_SPANISH` | unset | `1` brings back Spanish and the language picker. Off: English only |

### Admin settings

These live in the database. Change them from the Admin screen or with `PATCH /admin/<area>-settings`.

| Setting | Default | Meaning |
|---|---|---|
| **Tokens** (`token_settings`) | | |
| `priestly_prayers_per_token` | 10 | Verified prayers for others per Priestly token |
| `verified_prayer_min_gap_seconds` | 60 | Minimum gap between prayers that count as verified |
| `radio_funding` | tokens | `tokens` = radio prayers cost Priestly tokens; `free` = free (required for amateur radio) |
| `radio_prayer_cost` | 1 | Priestly tokens per radio prayer |
| `radio_amplify_repeats` | 3 | Times an amplified prayer is sent (free mode) |
| `radio_max_chars` | 1000 | Longest text sent by radio |
| `radio_transmitter` | log | `log` (stub) or `station` |
| `radio_station_requires_free` | true | Station mode only allowed with free funding |
| **Safety** (`safety_settings`) | | |
| `new_member_limits_enabled` | true | Limits for brand-new members |
| `new_member_hours` / `new_member_min_prayers` | 24 / 5 | Limits lift after a day and 5 prayers for others |
| `new_member_posts_per_day` / `comments_per_day` | 3 / 10 | |
| `new_member_links_allowed` | false | |
| **Messages** (`messaging_settings`) | | |
| `prayer_messages_enabled` | true | Pray-ers can write privately to requesters |
| `prayer_messages_any_prayer` | true | Any prayer (not only a commitment) unlocks it |
| `direct_messages_enabled` / `direct_requires_mutual_follow` | true / true | |
| `request_message_limit` | 1 | Messages before the other person replies |
| `new_members_can_start` / `new_member_messages_per_day` | false / 20 | |
| `groups_enabled` / `group_max_members` | true / 200 | |
| **Events** (`event_settings`) | | |
| `events_enabled` / `new_members_can_host` | true / false | |
| `reminder_minutes` | 30 | Reminder before an event |
| `allowed_video_hosts` | Zoom, Meet, Teams, YouTube, Facebook, Vimeo, Whereby, Jitsi | Allowed meeting links |
| **Care** (`care_settings`) | | |
| `care_enabled` / `confession_enabled` | true / **false** | Confession stays off until a lawyer reviews it |
| `max_open_per_member` | 2 | |
| **Reach** (`reach_settings`) | | |
| `power_prayer_cost` / `power_prayer_reach` | 5 / 10 | |
| `power_prayer_free_per_week` / `max_per_recipient_day` / `active_days` | 1 / 3 / 14 | |
| **Bot-like activity** (`activity_settings`) | | |
| `signals_enabled` / `max_prayers_per_hour` | true / 60 | Flags only; a moderator decides |
| `regular_min_events` / `regular_max_stddev_seconds` | 20 / 1.0 | "Too regular to be human" check |
| **Prompts** (`prompt_settings`) | | |
| `default_tone` | gentle | Prayer prompt tone (members can choose firm) |
| **Future** (`future_settings`) | | |
| `ai_chat_enabled` / `purchases_enabled` / `common_fund_page_enabled` | all false | Not built for V1 |
| `common_fund_percent` | 10 | |
| **Tiers** (`tier_settings`) | thresholds unset | Set with `PATCH /admin/tiers/:tier` once decided |

### Values in code

These are still open decisions, kept in one place each.

| Value | Where | Current |
|---|---|---|
| Preview length | `apps/server/src/config.ts` `product.previewChars` | 200 characters |
| Max words per post | `product.maxPostWords` | 1000 |
| Tokens per Praying Now / check-in | `product.prayingNowTokens` | 1, once per post (or commitment) per UTC day; none for your own request |
| Prompt spacing | `product.promptMinHours` / `promptsPerDay` | 12 hours / 2 a day |
| Feed ranking weights | `apps/server/src/modules/feed/index.ts` `weights` | Commitments > taps; tokens raise, never hide |
| Offline queue lifetime | `apps/mobile/src/lib/offline.ts` `MAX_AGE_MS` | 3 days |
| Request timeout | `apps/mobile/src/lib/api.ts` `TIMEOUT_MS` | 15 s |
| Devices | `apps/mobile/app.json` `ios.supportsTablet` | true (iPhone, iPad, and a resizable Mac window); false makes it iPhone-only with a fixed Mac window |
| Bundle ID | `apps/mobile/app.json` | com.zoomatech.prayertower |

## 7. Background jobs

All times are UTC (`apps/server/src/tasks.ts`).

| Job | When |
|---|---|
| Commitment reminders | every minute |
| Scheduled token gifts | every minute |
| Worker heartbeat (`ops_heartbeat`) | every minute |
| Event reminders | every 5 minutes |
| Milestone bonuses (enabled rules only) | every 5 minutes |
| Ops check and admin alert ([MONITORING.md](MONITORING.md)) | every 5 minutes |
| Failed-job check and admin alert | every 10 minutes |
| Automated-tap scan (flags only) | every 15 minutes |
| Retention purge | daily 03:30 |
| Token ledger check | daily 04:15 |
| Weekly token resupply by tier | Monday 00:05 |
| Pilot report to the sponsor | Monday 08:00 |
| Weekly commitment review | Sunday 18:00 |
| Weekly digest email | Sunday 19:00 |
| On demand | push, AI moderation scan, token credit after Praying Now, radio transmit |

Failed jobs retry with backoff and then show in Admin → Background jobs, with Retry and Discard ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)).

## 8. Things to know before changing code

- **Tests** run against a real local Postgres, not mocks. Several tests change admin settings and put them back afterwards, so put back anything you change.
- **Notices.** `notifications.notify()` takes a `dedupeKey`. Use one for anything that could repeat.
- **Moderation.**
  - AI only flags content, and only hides the most severe categories until a person reviews them.
  - Removal, forfeiture, clawback and suspension are moderator actions, and each one is logged.
  - A removal settles every pending report on that content.
- **Crisis posts** (suicide or self-harm wording) stay up, show the crisis line, and can't be amplified until a person reviews them.
- **Suspended members** can read, appeal, block, report, ask for care and delete their account. Nothing else.
- **The web build** exists for tests and previews. Lazy screens can't load offline on web, so the offline e2e test visits screens before it cuts the connection.
- **Pilot scope.** English only, iPhone only, about 10 members. Spanish and Android code stays in the repo, switched off; do no Spanish, Android or load-test work unless Steve asks. Old Android, Spanish and load-test docs are in `docs/archive/`.
