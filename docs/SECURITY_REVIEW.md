# Security review for the 10-member pilot

Reviewed 2026-10-28 on branch `claude/project-thread-crq6q6`: 57 tables and 143 API routes.

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

## Settings to confirm on the hosted project before the pilot

These live in the Supabase dashboard (Authentication), not in code. They are also in the [pilot launch checklist](PILOT_LAUNCH_CHECKLIST.md).

- **Minimum password length of at least 8.** Supabase says anything shorter "is not recommended". Local `config.toml` uses 6. Requiring mixed character types is optional. Leaked-password protection needs the Pro plan. ([Supabase: Password security](https://supabase.com/docs/guides/auth/password-security))
- **Email confirmations on**, so accounts belong to real inboxes.
- **Sign-ups off for an invite-only pilot.** Invite the 10 members from the dashboard or with `auth.admin.inviteUserByEmail`. ([Supabase: inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail))
- **Keep the secret key on the API server only.** It must never be in the mobile app or its `.env`.

## Account deletion

`DELETE /me`, reached from Me → Delete my account, removes the sign-in from `auth.users`, along with the member's profile details, content and activity. Because the token ledger is append-only, the profile row stays behind as an anonymous "Deleted member" tombstone, and it can no longer sign in. A request that holds other people's tokens is emptied and taken down rather than deleted. Covered by `test/account-deletion.test.ts` and the end-to-end test `05-account`.

## Accepted for the pilot

- **CORS allows any origin when `CORS_ORIGINS` is unset.** The API uses bearer tokens, not cookies, so another site can't act as a signed-in member. Set `CORS_ORIGINS` anyway if a web build is hosted.
- **Moderation and Witness staff can see who wrote an anonymous request**, so help can reach that person. The app labels these requests as anonymous.
- **Message bodies are stored in plain text** in Postgres, readable by database administrators. End-to-end encryption is a post-pilot item.
