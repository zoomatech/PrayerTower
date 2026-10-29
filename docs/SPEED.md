# Speed check: app start and feed scrolling

Profiling only: one member on one device, no load test. Run it after changes to
the feed, the skins or start-up:

```
npm run build:web -w @prayer-tower/e2e
cd apps/e2e && E2E_SPEED=1 npx playwright test tests/23-speed.spec.ts
```

It turns every feature switch on, signs in as Demo Ethel, and for no skin and
then each feed skin: opens the feed, times it until the first request card (or
the tower's climbing controls) shows, counts the requests made, then scrolls
down and back up while recording every frame. The CPU is slowed 4x
(`E2E_SPEED_CPU=1` turns that off) to stand in for a phone. Results print as a
table and go to `apps/e2e/test-results/speed.json`.

## 2026-10-29 results (4x slower CPU, every switch on)

| Skin | First card, before | First card, after | Requests, before → after | Scroll: 95% of frames within | Frames over 34 ms |
|---|---|---|---|---|---|
| none | 1384 ms | 1068 ms | 21 → 15 | 17 ms | 0 |
| column | 1335 ms | 952 ms | 20 → 14 | 17 ms | 0 |
| vine | 1342 ms | 1095 ms | 27 → 21 | 17 ms | 0 |
| flip | 1347 ms | 1119 ms | 26 → 20 | 17 ms | 0 |
| swipe | 1012 ms | 946 ms | 26 → 20 | 17 ms | 0 |
| beanstalk | 1363 ms | 970 ms | 27 → 21 | 17 ms | 0 |
| golden-wood | 904 ms | 989 ms | 27 → 21 | 17 ms | 0 |
| moonlit-gate | 1412 ms | 982 ms | 27 → 21 | 17 ms | 0 |
| wall | 1294 ms | 975 ms | 26 → 20 | 17 ms | 0 |
| prayer-tower | 1301 ms | 962 ms | 26 → 20 | 17 ms | 0 |
| neon-cinderella | 1261 ms | 958 ms | 27 → 21 | 17 ms | 0 |
| neon-circuit | 1328 ms | 1020 ms | 26 → 20 | 17 ms | 0 |
| blossom-garden | 1355 ms | 1241 ms | 27 → 21 | 17 ms | 0 |

"First card" counts from the page load, including the test's own overhead.
Measured inside the page with no CPU slowdown, the first card went from about
490 ms to about 325 ms.

Scrolling was already smooth under every skin: 17 ms is one frame at 60 frames
a second, and no frame took twice that. The list skins already render only a
few cards ahead (`src/layouts/list-tuning.ts`).

## What was slow, and the fixes

1. **The profile was fetched twice at start.** Supabase sends an
   `INITIAL_SESSION` event for the session `getSession()` has already loaded,
   and both paths loaded the profile. `lib/auth.tsx` now skips that event (and
   the hourly `TOKEN_REFRESHED`, which changes nothing on the profile).
2. **The feed waited for the "needs" panel.** The feed and the macro-needs
   panel were fetched together and the feed waited for both; the highlights
   request only started after the feed. All three now start together and the
   feed shows as soon as it arrives.
3. **Web only: screens loaded in a second step.** Expo Router splits the web
   build by screen ("async routes", on by default for web from SDK 58), and
   React holds a suspended screen back for about 300 ms. The web build now
   loads all screens up front (`asyncRoutes: { web: false }` in app.json),
   like the iPhone app, whose production builds always load routes
   synchronously ([Expo: Async routes](https://docs.expo.dev/router/web/async-routes)).
   This also makes the web measurements match the iPhone more closely.

The CPU profile of a start-up showed about 120 ms of script work out of
1 second; the rest was waiting on the steps above.
