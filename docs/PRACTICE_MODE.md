# Practice mode for the paid services

The three features that need a paid service (AI, live video and App Store token purchases) can be tried before any key is set. Turn them on in **Admin → Practice mode**. All three switches are **off by default**.

Each practice feature says plainly that it is practice. Once the real key is set, its practice switch does nothing and the real service is used.

| Switch | What members see | Real service that replaces it |
|---|---|---|
| **Practice AI replies** | The AI conversation, circle facilitator and Auto-Pray answer with a fixed reply that starts "Practice reply: no AI service is connected yet…". Their own switches (Admin → AI) still decide whether each feature shows. | `ANTHROPIC_API_KEY` (docs/AI_COMPANIONS.md, docs/AUTO_PRAY.md) |
| **Practice live rooms** | Staff can start a room with no video server. It opens a page on our own server that says there is no video yet. | Your own Jitsi server (Admin → Live video), or JaaS keys `JAAS_APP_ID`, `JAAS_API_KEY_ID`, `JAAS_PRIVATE_KEY` (docs/LIVE_VIDEO.md) |
| **Practice token purchases** | The token store sells packs for free, on any device, marked "Practice" in the member's history. Needs "Buying tokens" on. | The App Store connection, `APPLE_ROOT_CA_PATHS` and the rest (docs/TOKEN_PURCHASE.md) |

The admin screen lists what is really connected, so it shows which switches still matter.

## Safety rules

- **Practice purchases are refused when `APPLE_IAP_ENVIRONMENT=Production`**, and whenever the App Store connection is set. They can't run beside real purchases.
- A practice purchase can only credit the member who sends it (`appAccountToken` must be their own id), and each one credits once.
- Practice purchases carry no price, so nothing is added to the Common Prayer Fund report.
- Practice tokens are real ledger entries. Before launch, decide whether to keep or reverse them; each one is in `token_purchases` with `environment = 'Practice'`.
- The practice room page needs no sign-in, because the in-app browser has none. It shows only the room's random name, which is 16 random characters.
- Changing a switch is an admin route, so it is in the audit log.

## JaaS (8x8) live rooms

With the three `JAAS_*` keys set and no own Jitsi server, a new room opens on `https://8x8.vc/<AppID>/PrayerTower-…`. Each member gets their own token when they open the list of live rooms. The token lasts 3 hours, the host is the room's moderator, and recording, live streaming and transcription are off. The token fields follow 8x8's [JaaS JWT page](https://developer.8x8.com/jaas/docs/api-keys-jwt); room names use the `<AppID>/<room>` form from the [JaaS iFrame API page](https://developer.8x8.com/jaas/docs/iframe-api-integration).

To get the keys: in the JaaS console, open API keys, add a key, and download its private key ([8x8: generate and add API keys](https://developer.8x8.com/jaas/docs/api-keys-generate-add)).

The room opens with `?jwt=<token>` added to its address. 8x8 documents the token for its iFrame API and mobile SDK. The first real test should confirm the web address form works in the in-app browser; if it doesn't, the app can switch to the JaaS iFrame page.

## Code

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029081400_practice_mode.sql` (`paid_practice_settings`) |
| Server | `apps/server/src/modules/practice-mode/`, `live/jaas.ts`; used in `ai/routes.ts`, `ai/auto-pray.ts`, `live/index.ts`, `store/index.ts` |
| App | Admin → Practice mode (`PracticeModeSection` in `app/admin.tsx`), `app/token-store.tsx`, `practiceTransaction` in `lib/token-store.ts` |
| Tests | `apps/server/test/practice-mode.test.ts`, `apps/mobile/src/__tests__/practice-mode.test.tsx` |
