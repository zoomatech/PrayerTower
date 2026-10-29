# Security review for the 10-member pilot

Reviewed 2026-10-28 on a work branch, since merged into `main`: 57 tables and 143 API routes.

## How the app is protected

- **The database is closed to phones.** The app never talks to the Supabase Data API. Every table has row-level security switched on with no policies, and the `anon` and `authenticated` roles have no grants on tables, sequences or functions. The API server, which connects as `postgres`, is the only reader and writer.
- **Every member route needs a sign-in.** All routes sit behind one auth hook that checks the Supabase access token against the project's published signing keys (JWKS) and turns suspended members away from anything but reading and appealing. Five routes are outside it. `GET /health` is one. The radio station's two `/station/*` routes take a separate shared key compared in constant time. The two public account-deletion routes, `GET /account-deletion` and `POST /account-deletion/requests`, are limited to 10 requests a minute per IP address. A request posted there only queues an entry for staff, who confirm by email before deleting anything.
- **Staff routes check roles.** That covers admin (34 routes), moderation queues and decisions, the Witness team, care queues, macro needs and restorative circles.
- **Object routes check ownership.** Commitments, scheduled gifts, prompts, notifications, care requests, pools, events, "answered" and "thanks" all scope by the caller. Conversations require membership. Removed or held posts, and posts from blocked members, return 404.
- **Media stays private.** The `post-media` bucket is private. Uploads use signed upload URLs under the member's own folder, and reads use short-lived signed URLs.

## Automated checks (apps/server/test/security.test.ts)

These run with every `npm test` and fail if anything regresses:

1. Every public table has RLS on, and there are no policies.
2. `anon` and `authenticated` have no table, view, sequence or function privileges in `public`.
3. No storage bucket is public.
4. Every route the app registers returns 401 without a sign-in, apart from the five open routes listed above. The list of routes comes from Fastify itself, so a new route is covered automatically.
5. A plain member gets 403 from every admin, Witness and moderator-queue route.
6. Media can only be attached from the member's own upload folder.
7. The rate limit cuts off a flooding member without affecting others.

## Findings and fixes

| # | Finding | Risk | Fix |
|---|---|---|---|
| 1 | `token_pool_account()` was still executable by `anon` and `authenticated`. It runs with the caller's rights, and those roles can't touch any table, so it couldn't do anything. | Low | Migration `20261028101300_lock_down_functions.sql` revokes it again. Check 2 above now guards it. |
| 2 | Media paths were checked only by their user-id prefix, so a path like `<me>/../<other>/x.jpg` passed. | Low to medium | The path must now be exactly `<user id>/<uuid>.<ext>`, the shape the upload route hands out. |
| 3 | The Witness "add note" and "flag" routes read the request body before checking the role, so a non-staff member could get a 400 instead of a 403. | Low (information only) | The role is checked first. |
| 4 | There was no API rate limit. | Medium | Added `@fastify/rate-limit`, counted per signed-in member after auth. The default is 300 requests per minute, set with `RATE_LIMIT_PER_MINUTE`, and 0 turns it off. |

## Second review (2026-10-28, after the go-live rehearsal)

Everything merged since the first review: invite-only sign-up and the `ADMIN_EMAILS` bypass, announcements, church partners, witness stories, testimonies, notebook features, job and operations admin, CSV import, the digest and sponsor emails, the public website and shared links, and the token and radio changes.

How it was checked:

- Every route the API registers was called as a plain signed-in member, outside the prefixes check 5 already covers (`/admin`, `/witness`, the moderation queues). Each one either refused the call or returned only that member's own data or public data. The two that looked odd are fine: `POST /conversations/:id/read` only updates the caller's own membership row, and `GET /post/:id` is a static page that reads nothing from the database.
- Token moves were sent concurrently: 8 gifts and 8 radio sends at once from a member with 1 token gave exactly one success each, and one key sent 3 times at once moved 1 token. The ledger function locks the accounts.
- The station API needs a key of 24 or more characters, compared in constant time. The invite hook is `security definer` with an empty `search_path`, and `app_metadata` (its other bypass) can't be set by a member at sign-up.
- Staff-typed text in the invite, digest and sponsor emails is HTML-escaped. The data export leaves out staff identities (`omit` columns).

| # | Finding | Risk | Fix |
|---|---|---|---|
| 5 | `ADMIN_EMAILS` addresses may sign up without an invite code and are then made admin. If the hosted project's "Confirm email" setting is off, Supabase confirms every account at sign-up, so anyone who knows the address and signs up first would become admin. | High, if confirmations are off | In production, an account is made admin only if Supabase actually sent it a confirmation email (`auth.users.confirmation_sent_at`, checked on a local stack with confirmations on and off). Otherwise the server logs a warning saying what to change. `scripts/go-live.sh` turns confirmations on when `SUPABASE_ACCESS_TOKEN` is set. Test: `bootstrap-admins.test.ts`. |
| 6 | The weekly digest email quoted answered requests the member had prayed for, including requests marked sensitive, and requests from someone who has since blocked them (or whom they blocked). | Medium (privacy) | The digest leaves out other people's sensitive requests and anything across a block. Test: `digest.test.ts`. |
| 7 | In station mode, members could spend a Priestly token on a prayer the station would never send. Found in the go-live rehearsal and fixed in #48. | Low (lost tokens) | Refused up front, with a plain message. |

## Phase 3 review (2026-10-29)

A regression and security pass over the Phase 3 features (push delivery, gentle reminders, moderation tools, two-step backup codes and passkeys, practice mode, JaaS live rooms).

- **Staff routes, wider check.** The plain-member test now covers every `/admin`, `/witness`, `/moderation`, `/staff`, `/station-admin` and `/oncall` route. The only exceptions are the two member routes `/moderation/precheck` and `/moderation/items/:id/appeal`.
  - It found two staff routes that checked the body before the role: `POST /staff/reading-plans` and `POST /staff/radio-allocation-requests/:id/decide`. Both had a role check inside, so nothing leaked, but a member could see a 400 instead of 403. Both now check the role first.
- **No 500s on bad ids.** A new test (`test/no-500s.test.ts`) sends a malformed id to every route with an id, as an admin with every staff role. No route answers 500.
- **SQL.** Every query built with string interpolation uses a fixed column list or a fixed table map, never member input.
- **HTML pages.** Server-made pages escape member text (`site.esc`). The new practice room page shows only a room name that has already been checked (letters, digits, `-` and `_`).
- **Backup codes.** Codes are hashed with scrypt and compared with `timingSafeEqual`. There are 5 wrong tries an hour, and a used code is spent.
- **Practice purchases.** These are refused in production and whenever the App Store connection is set. They credit only the member who sends them, and each credits once.
- **JaaS tokens.** Each member gets their own token, good for 3 hours. Only the host is moderator, and recording and streaming are off.
- **Dependencies.** `npm audit --omit=dev --audit-level=high` for the server is clean.

## Settings to confirm on the hosted project before the pilot

These live in the Supabase dashboard (Authentication), not in code. They are also in the [pilot launch checklist](PILOT_LAUNCH_CHECKLIST.md).

- **Minimum password length of at least 8.** Supabase says anything shorter "is not recommended". Local `config.toml` uses 6. Requiring mixed character types is optional. Leaked-password protection needs the Pro plan. ([Supabase: Password security](https://supabase.com/docs/guides/auth/password-security))
- **Email confirmations on**, so accounts belong to real inboxes. `ADMIN_EMAILS` depends on it: in production, an account is made admin only if Supabase sent it a confirmation email (see the second review below).
- **The invite-code hook on** (Authentication → Hooks → Before User Created → `public.hook_before_user_created`). `scripts/go-live.sh` turns it on when `SUPABASE_ACCESS_TOKEN` is set ([INVITES.md](INVITES.md)). Sign-ups stay on; the hook refuses anyone without a valid code, apart from the `ADMIN_EMAILS` addresses.
- **Keep the secret key on the API server only.** It must never be in the mobile app or its `.env`.

## Account deletion

`DELETE /me`, reached from Me → Delete my account, removes the sign-in from `auth.users`, along with the member's profile details, content and activity. Because the token ledger is append-only, the profile row stays behind as an anonymous "Deleted member" tombstone, and it can no longer sign in. A request that holds other people's tokens is emptied and taken down rather than deleted. Covered by `test/account-deletion.test.ts` and the end-to-end test `05-account`.

## Accepted for the pilot

- **CORS allows any origin when `CORS_ORIGINS` is unset.** The API uses bearer tokens, not cookies, so another site can't act as a signed-in member. Set `CORS_ORIGINS` anyway if a web build is hosted.
- **Moderation and Witness staff can see who wrote an anonymous request**, so help can reach that person. The app labels these requests as anonymous.
- **Message bodies are stored in plain text** in Postgres, readable by database administrators. End-to-end encryption is a post-pilot item.

## Dependency audit (2026-10-28)

`npm audit` before: 4 high and 19 low. After: 3 high and 16 low. All of what is left is in build tools on the developer's Mac, never in the server or the app.

- **Updated** to the latest patch and minor versions:
  - Server: `@sentry/node` 11.9.0, `marked` 18.1.2, `nodemailer` 10.2.1.
  - App: the Expo SDK 58 patch versions that Expo's own `bundledNativeModules.json` names: `expo` 58.0.20, `expo-router` 58.0.27, `expo-web-browser` 58.0.7, `@expo/ui` 58.0.24, `react-native-screens` 4.30.1.
  - Tests: `@axe-core/playwright` 4.14.0.
  - Held back, because Expo pins their versions for SDK 58: `react`, `react-native`, `@sentry/react-native` and the other native libraries. Major versions (ESLint 10, TypeScript 7) and Playwright (its browser is installed separately) are also held.
- **Removed:** the high `tmp` path-traversal finding ([GHSA-ph9p-34f9-6g65](https://github.com/advisories/GHSA-ph9p-34f9-6g65)). It came in through `workbox-cli`'s setup wizard. The web build now calls `workbox-build` directly (`node workbox-config.js`), which makes the same service worker.
- **Left, with no fix available:** `zod` 3.25.76 inside `@expo/cli` ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), fixed only in zod 4.6.6). Every `@expo/cli` 58 release asks for zod 3. It only validates Expo's own config files during a build. The server uses zod 4.6.7, which has the fix. The CI audit for the server, station and shared packages (`--omit=dev --audit-level=high`) is clean.
- **Low:** `deepmerge` prototype poisoning, inside Expo's config tooling. It also needs an Expo release to fix.
- **CodeQL:** the one alert raised this week (a slow email pattern in the staff audit log, PR #51) was fixed before merging.
