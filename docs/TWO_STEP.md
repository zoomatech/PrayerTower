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

## A member lost their phone
- After checking it's really them, an admin removes their factor in the Supabase SQL editor:
  `delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'member@example.com');`
- The member then signs in with just the password, and can turn two-step on again.
