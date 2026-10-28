# Pilot launch checklist (10 members)

Work through this list top to bottom before inviting anyone. The setup steps themselves are in [DEPLOY.md](DEPLOY.md), and the security background is in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Every switch named here can be changed later from the admin screen or the database, so these are starting values, not final decisions.

## 1. Must be done first

- [ ] **In-app account deletion.** Apple requires apps that let people create accounts to "also let people initiate deletion of their account within the app". Deleting the account has to remove the user's content too, including "text posts". ([App Review: 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)) External TestFlight builds go through Beta App Review first. ([TestFlight](https://developer.apple.com/testflight/)) This is being built next. It erases the member's content and personal details, and keeps only the token ledger rows, which are append-only, under an anonymous id.
- [ ] **Privacy policy and terms**, with links in the app and in App Store Connect.
- [ ] **Crisis resources checked for the pilot's country**, both the crisis banner text and the numbers.

## 2. Hosted Supabase project

- [ ] Run every migration with `supabase db push`. Run `npm test` against a local copy first.
- [ ] Set the minimum password length to at least 8 (Authentication → Email). ([Supabase: Password security](https://supabase.com/docs/guides/auth/password-security))
- [ ] Turn email confirmations on.
- [ ] For an invite-only pilot, turn sign-ups off and invite the 10 members from the dashboard. ([Supabase: inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail))
- [ ] Confirm the `post-media` bucket is private. The security test checks this locally.
- [ ] Confirm backups are on (DEPLOY.md §3) and do one test restore.
- [ ] **Never run `npm run seed:demo` here.** It refuses to run against a non-local database. Pilot content comes from real people.

## 3. API and worker

- [ ] Set the secrets only on the server: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and optionally `STATION_API_KEY`, `EXPO_ACCESS_TOKEN` and `OPENAI_API_KEY`. None of them may go in the mobile app.
- [ ] Set `RATE_LIMIT_PER_MINUTE` (default 300 per member).
- [ ] Set `CORS_ORIGINS` if a web build is hosted. Native apps don't need it.
- [ ] Make sure the worker is running. Reminders, prompts, moderation scans, activity flags and push notifications depend on it.
- [ ] Check that `GET /health` returns `{"ok":true}`, and set up the uptime check (DEPLOY.md §4).

## 4. People and roles

- [ ] Give the first admin their role: `npm run grant-role -- <email> admin`.
- [ ] Assign at least one **moderator** who checks the queue daily, and name a backup.
- [ ] Assign a **pastor_counselor** and at least one **prayer_partner** if prayer partners stay on. Assign **witness** members if the Witness team is used.
- [ ] Agree who answers crisis flags, and how quickly.

## 5. Switches to review (admin screen)

| Area | Starting value | Where |
|---|---|---|
| New-member limits | On (24 hours, 5 prayers) | Safety settings |
| Prayer messages, direct messages, groups | On | Messaging settings |
| Events, video hosts | On (Zoom, Meet, Teams, and others) | Event settings |
| Prayer partners / confession | On / **off** | Care settings |
| Automated-tap signals | On (flags only, no penalties) | Activity settings |
| Token purchase, Common Prayer Fund page, AI chat | **All off** | Future settings |
| Radio station | Off until `STATION_API_KEY` is set | Server env |
| Feed style | Column default; Vine 2.0 is a beta choice | Feed themes |

## 6. App builds

- [ ] Point the iOS build at the hosted API and Supabase (`EXPO_PUBLIC_*`). Use bundle ID `com.zoomatech.prayertower`.
- [ ] Upload to TestFlight. Internal testers (up to 100 team members) need no review. External testers need a build approved by Beta App Review, a beta description and review notes. Give the reviewer a demo login on the hosted project, created by hand and not with the seed. ([TestFlight](https://developer.apple.com/testflight/))
- [ ] Put the Android build on a Play internal testing track, if Android members are included.
- [ ] Make sure push notifications arrive on a real device for a prayer, a message and an event reminder.

## 7. Final checks

- [ ] `npm test`: all server and station tests pass, including the security checks.
- [ ] `npm run test:e2e`: all 10 main flows pass locally.
- [ ] Do one manual pass on a real phone: sign in, post, pray, commit, message, RSVP, report, and delete the account.
- [ ] Set up a feedback channel, for example a group chat or a form, and tell members how to report bugs.
- [ ] Rollback plan: keep the previous build in TestFlight, and take a database backup before each migration.

## 8. During the pilot (weekly)

- [ ] Read the admin pilot report (`/admin/pilot-report`) and the metrics.
- [ ] Clear the moderation queue, appeals and activity flags.
- [ ] Collect member feedback and answer the open questions listed in the PR.
