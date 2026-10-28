# Invite codes (invite-only pilot)

While **invite-only mode** is on, a new member needs an invite code to create an account. It is **on by default**.

## How it works

- **Where the check runs.** Supabase Auth's [Before User Created hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) calls `public.hook_before_user_created`. The function is defined in `supabase/migrations/20261028230000_invite_codes.sql`. Because Auth runs the check, it applies to every client, not only the app.
- **When sign-up is refused.** With invite-only on, sign-up is refused (403) when:
  - no `invite_code` is in the user metadata, or
  - the code is unknown, revoked, expired or used up.
- **What a valid code does.** It adds one to the code's use count. The trigger `on_auth_user_created_invite` then records which code the new member used, in `invite_redemptions`.
- **Accounts staff create.** Accounts created with the secret key (`seed:demo`, `review-account`, `load-test`) don't pass through the hook. They also set `app_metadata.invite_exempt`.
- **Turning the mode off.** With invite-only off, anyone can sign up.

## In the app

- **Admin → Invite codes:**
  - Turn invite-only on or off.
  - Create codes: 1 to 50 at a time. Each code can be used by 1 to 1,000 people and expires after 1 to 365 days, or never. You can add an optional note saying who it is for.
  - Share or revoke a code.
  - Every change is in the audit log.
- **Sign-up:** shows an "Invite code" field while invite-only is on. The app reads the mode from the public `GET /signup-config` endpoint.
  - The link `prayertower://sign-in?invite=CODE` opens sign-up with the code already filled in.
  - Codes are not case-sensitive, and spaces at either end are ignored.

## Hosted project setup (one time, Steve)

1. Apply the migration, with `supabase db push` or the deploy pipeline.
2. `scripts/go-live.sh` does this step itself when `SUPABASE_ACCESS_TOKEN` (a personal access token) is in `deploy/production.env`. It calls the Management API's [update auth config](https://supabase.com/docs/reference/api/v1-update-auth-service-config) with `hook_before_user_created_enabled` and `hook_before_user_created_uri`. By hand: in the Supabase Dashboard, go to **Authentication → Hooks**. Add the **Before User Created** hook, choose the type **Postgres function**, then pick `public.hook_before_user_created` ([Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)).
3. Test it. Try to sign up without a code: you should get "Prayer Tower is invite-only right now. Enter your invite code."

For local development, `supabase/config.toml` turns the hook on (`[auth.hook.before_user_created]`).

## Notes

- **Grants.** The migration grants `usage` on the `public` schema and `execute` on the function to `supabase_auth_admin`, and revokes `execute` from `anon`, `authenticated` and `public`. These are the grants the [Auth Hooks guide](https://supabase.com/docs/guides/auth/auth-hooks) requires.
- **Why the function is `security definer`.** The guide recommends against `security definer` and suggests RLS policies for `supabase_auth_admin` instead. This project's rule is no policies on any public table, with every table reached only through the server (`security.test.ts`). So the function is `security definer` with an empty `search_path`.
