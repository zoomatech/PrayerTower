# Load test: 10–100 members

> Run 2026-10-28 on a local stack (Supabase in Docker, API on Node 22 via tsx), all on **one 4-core, 16 GB cloud container**. The load generator, the API, Postgres and Docker's port proxy all shared those 4 cores, so the numbers understate a real server. Re-run with `npm run load-test -w @prayer-tower/server` (how-to below).

## Result

**The pilot (10 people) and 100 active members both run comfortably on one small machine.** With 100 members each acting about once a second, much busier than real people, the API served 117 requests per second with **no errors**, and the typical (p50) request took 2–12 ms. 95% of requests finished under 20 ms.

Flat out (100 members, no pause between actions) it reached about **420 requests per second** before the shared CPU saturated. Latency then rose to around 0.4 s for the feed, but there were still no errors.

## What each simulated member does

They sign in through Supabase Auth with real tokens, so the server checks JWTs exactly as in production. Each member then loops through these actions, with a 0.5–1.5 s pause between them:

| Share | Action |
|---|---|
| 40% | Read the feed (`GET /feed`) |
| 20% | Open a request and its comments |
| 15% | Check notifications |
| 10% | Load their profile (`GET /me`) |
| 12% | Tap Praying Now |
| 3% | Post a new prayer request |

## Realistic pace (pause about 1 s between actions)

### 10 members, 60s, think 1000ms: 11.5 req/s, 702 requests, 0 server errors

| Route | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/dropped |
|---|---|---|---|---|---|---|
| GET /feed | 241 | 12 | 17 | 53 | 56 | 0 |
| GET /me | 72 | 3 | 5 | 34 | 34 | 0 |
| GET /me/notifications | 98 | 3 | 5 | 35 | 35 | 0 |
| GET /posts/:id | 109 | 8 | 12 | 17 | 21 | 0 |
| GET /posts/:id/comments | 109 | 3 | 4 | 9 | 9 | 0 |
| POST /posts | 19 | 13 | 45 | 45 | 45 | 0 |
| POST /posts/:id/praying-now | 54 | 8 | 11 | 15 | 15 | 0 |

### 50 members, 60s, think 1000ms: 59.5 req/s, 3644 requests, 0 server errors

| Route | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/dropped |
|---|---|---|---|---|---|---|
| GET /feed | 1186 | 11 | 16 | 127 | 138 | 0 |
| GET /me | 277 | 2 | 5 | 59 | 62 | 0 |
| GET /me/notifications | 439 | 2 | 3 | 44 | 55 | 0 |
| GET /posts/:id | 641 | 6 | 10 | 109 | 116 | 0 |
| GET /posts/:id/comments | 641 | 3 | 4 | 22 | 47 | 0 |
| POST /posts | 91 | 11 | 18 | 123 | 123 | 0 |
| POST /posts/:id/praying-now | 369 | 6 | 10 | 63 | 74 | 0 |

### 100 members, 60s, think 1000ms: 116.6 req/s, 7151 requests, 0 server errors

| Route | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/dropped |
|---|---|---|---|---|---|---|
| GET /feed | 2365 | 12 | 20 | 245 | 255 | 0 |
| GET /me | 604 | 2 | 4 | 11 | 84 | 0 |
| GET /me/notifications | 936 | 2 | 4 | 67 | 90 | 0 |
| GET /posts/:id | 1151 | 6 | 11 | 187 | 220 | 0 |
| GET /posts/:id/comments | 1151 | 2 | 4 | 27 | 55 | 0 |
| POST /posts | 187 | 11 | 19 | 192 | 224 | 0 |
| POST /posts/:id/praying-now | 757 | 6 | 12 | 70 | 130 | 0 |

## Stress (no pause, 100 members)

### 100 members, 30s, think 0ms: 423.5 req/s, 12789 requests, 0 server errors

| Route | Requests | p50 ms | p95 ms | p99 ms | Max ms | 5xx/dropped |
|---|---|---|---|---|---|---|
| GET /feed | 4375 | 413 | 470 | 488 | 524 | 0 |
| GET /me | 1057 | 95 | 123 | 140 | 176 | 0 |
| GET /me/notifications | 1622 | 65 | 87 | 105 | 129 | 0 |
| GET /posts/:id | 2073 | 282 | 325 | 347 | 376 | 0 |
| GET /posts/:id/comments | 2073 | 95 | 119 | 131 | 172 | 0 |
| POST /posts | 344 | 274 | 337 | 365 | 374 | 0 |
| POST /posts/:id/praying-now | 1245 | 80 | 104 | 116 | 147 | 0 |

Before the fixes below, the same stress run gave 377 req/s, and the feed's p50 was 469 ms.

## Hot spots found and fixed

1. **Feed cards ran one query per card for Power Prayer reach** (`posts.cards` → `tokens.reachOf`, called with `Promise.all`). A 20-card feed fired 20 queries at once and took every connection in the 10-connection pool, so other members' requests queued behind it. Now it's a single query (`tokens.reachOfMany`).
2. **Commitment counts had no index by post.** Every feed card counts its post's commitments, and the only indexes began with `user_id`. Migration `20261028200000_feed_load_indexes.sql` adds `commitments_post_idx`.
3. **The pool size is now configurable.** Set `DATABASE_POOL_MAX` (default 10) for the API and the worker. Raising it to 20 made no difference on this machine, because CPU was the limit. On hosted Supabase, keep API + worker connections under your plan's connection limit.

## Not a problem yet (watch later)

- The feed query ranks up to 500 recent posts per request. Against 1,700 posts it took about 5 ms in Postgres. Revisit it past roughly 10,000 posts a month, for example by caching the candidate list for 30 s.
- A CPU profile of the API under load showed it mostly idle. The time went to Postgres and the Docker proxy, so a single Node process is enough well beyond 100 members.
- Supabase Auth limits sign-ins per IP (local default: 30 per 5 minutes). Real phones each have their own IP, so this only affects test scripts.

## How to re-run

```bash
npm run db:start
# Local only: raise sign-ins so 100 test members can sign in; set it back after.
#   supabase/config.toml → [auth.rate_limit] sign_in_sign_ups = 1000, then npx supabase stop && npm run db:start
cd apps/server
# .env needs SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY (npx supabase status -o env),
# and RATE_LIMIT_PER_MINUTE=0 plus PUSH_ENABLED=0 for the run.
npm run dev:api &
npm run load-test                                        # 10, 50, 100 members, 30 s each
LOAD_STAGES=100 LOAD_SECONDS=30 LOAD_THINK_MS=0 npm run load-test   # stress
```

The script refuses to run unless the database, Supabase and the API are all on this machine. It creates members `load<N>@load.prayertower.local` and posts test requests, so run `npm run db:reset` afterwards.
