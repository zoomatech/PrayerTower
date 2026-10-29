# Two-step sign-in

Members can add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and others) after their password. It uses Supabase Auth's TOTP factors, which are free and on for every Supabase project ([Supabase docs](https://supabase.com/docs/guides/auth/auth-mfa/totp)).

## Turning it on
- **Admin → Sign-in security → Two-step sign-in.** It is off by default.
- **Members:** Me → Password and email → **Turn on two-step sign-in**.
  - On a phone, **Add to my authenticator app** opens the app with the account filled in.
  - On the web, the screen shows a QR code.
  - Either way, the member can type the key into the app by hand.
  - The member types the app's first code to finish.
- **Signing in afterwards:** password, then **Enter your code**. Nothing else opens until the code is right.
- **Turning it off:** a member taps **Turn off two-step sign-in** on the same screen. If the admin switch is turned off, new members are no longer offered it. Members who already use it keep it.

## What the server enforces
- When a member has a verified factor, the API refuses a session that didn't enter the code (`aal1`). It answers `401 two_step_required`, and the app then asks for the code.
- Code: `apps/server/src/auth.ts`, `apps/server/src/modules/security`, `apps/mobile/src/components/two-step.tsx`, `apps/mobile/src/app/two-step.tsx`.

## Backup codes (Admin → Sign-in security → Backup codes, off)
- With two-step sign-in on, a member taps **Make backup codes** on Me → Password and email. They get 10 one-time codes like `K4M9-X7QP`, shown once, with **Download as a text file**.
  - Making new codes stops the old ones from working.
- **Lost phone:** on the code screen, **Lost your phone? Use a backup code**. One code turns two-step sign-in off, and the member is in.
  - The app then shows them Me → Password and email to set it up again.
  - They also get a notice: "Two-step sign-in was turned off with a backup code. If this wasn't you, change your password now."
- **How codes are checked:**
  - Case, spaces and dashes don't matter. O reads as 0, and I or L as 1.
  - Codes are stored as scrypt hashes only.
  - Five wrong codes in an hour lock it for the rest of that hour.
  - The `/me/two-step/recover` route is the only one open before the code (`apps/server/src/auth.ts`).
- **Why not Supabase's own recovery codes:** they are still experimental and can't be switched on in the local Supabase CLI yet ([Supabase docs](https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate)). These work on any Supabase project.
- Code: `apps/server/src/modules/security/backup-codes.ts`, `apps/mobile/src/components/backup-codes.tsx`. Tests: `two-step-recovery.test.ts`, `backup-codes.test.tsx`.

## A member lost their phone and their codes
- After checking it's really them, an admin opens Admin → People, finds them, and taps **Turn off two-step sign-in** twice.
  - This is recorded in the audit log, and the member gets a notice.
- The member then signs in with just the password, and can turn two-step on again.

## Passkeys (Admin → Sign-in security → Passkeys, off)
- Members sign in with Face ID, Touch ID or a security key, using Supabase Auth passkeys (beta, [changelog](https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta)).
  - **Add a passkey** is on Me → Password and email.
  - **Sign in with a passkey** is on the sign-in screen.
- **Web browsers only for now.** Supabase's passkey API uses the browser's WebAuthn, and its changelog doesn't cover native apps yet, so the iPhone app doesn't show passkeys.
  - The future native Swift app can use Apple's passkey APIs directly (docs/SWIFT_PORT.md).
- A passkey replaces the password, not the authenticator code. A member with two-step sign-in still enters the code.
- **Setup:**
  - Locally, `supabase/config.toml` has `[auth.passkey] enabled = true` and `[auth.webauthn]` for `localhost`.
  - On the hosted project, turn on **Authentication → Passkeys** in the Supabase dashboard. Set the Relying Party ID to the web app's domain (for example `prayertower.app`) and the origins to its https address. This is in STEVE_TODO.
