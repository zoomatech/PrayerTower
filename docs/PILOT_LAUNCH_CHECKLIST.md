# Pilot launch checklist (10 members)

Work through this list top to bottom before inviting anyone. The setup steps themselves are in [DEPLOY.md](DEPLOY.md), and the security background is in [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Every switch named here can be changed later from the admin screen or the database, so these are starting values, not final decisions.

## 1. Must be done first

- [x] **In-app account deletion** (Me → Delete my account; `DELETE /me`). Apple requires apps that let people create accounts to "also let people initiate deletion of their account within the app". Deleting the account has to remove the user's content too, including "text posts". ([App Review: 5.1.1(v)](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)) External TestFlight builds go through Beta App Review first. ([TestFlight](https://developer.apple.com/testflight/)) The feature erases the sign-in, profile, content and activity at once. It keeps only the append-only token ledger and moderators' decisions, under "Deleted member". Check that the privacy policy says this.
- [ ] **Privacy policy and terms.** Drafts are in `docs/legal/` and need a lawyer's review. The server publishes them at `/privacy` and `/terms`, showing the draft warning until the reviewed `PRIVACY_POLICY.md` and `TERMS_OF_USE.md` are added. Then set `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` to those URLs. The app links to them at sign-up and on the profile. Add the privacy URL in App Store Connect and Play Console.
- [x] **A web page for deletion requests**, which Google Play requires. It's at `https://<API host>/account-deletion` and is served by the API. Set `SUPABASE_PUBLISHABLE_KEY` and `SUPPORT_EMAIL` on the server. Check Admin → Account deletion requests weekly.
- [x] **Members can delete their own requests and comments.** It's in the post screen, with two taps to confirm.
- [ ] **Contact address in the app and on the web** (Apple 1.2). Set `EXPO_PUBLIC_SUPPORT_EMAIL` in the app and `SUPPORT_EMAIL` on the server, which shows it at `/support`. It shows on the profile and with the rules.
- [ ] **A real app icon.** Three drawn options are in [BRANDING.md](BRANDING.md), with "tower" as the default. Switch with `npm run brand -- <name>`. Have a designer finalize it before App Store review.
- [x] **iPad screenshots.** The app supports iPad (`ios.supportsTablet: true`), which also makes its Mac window resizable, so App Store Connect needs at least one iPad 13-inch screenshot (2064 × 2752). The set is in the project files under `store-screenshots/ipad-13in-2064x2752`. ([Apple: Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/))
- [ ] **Check the "Pray now" widget** on a test phone after the first build with it. See [PRAY_NOW_WIDGET.md](PRAY_NOW_WIDGET.md).
- [ ] **Check the Mac and iPad build in Xcode.** Build once on a Mac to compile the menu bar module (`apps/mobile/modules/mac-menu`), then try the shortcuts in [MAC_AND_IPAD.md](MAC_AND_IPAD.md).
- [ ] **Store privacy answers and listing copy** from `docs/store/`.
- [ ] **Crisis line for the pilot's country.** Set `EXPO_PUBLIC_CRISIS_COUNTRY` (app) and `CRISIS_COUNTRY` (server) to the same value: `US` for 988 (the default), `CA` for 9-8-8, or `GB`/`IE` for Samaritans 116 123. The numbers were checked on 2026-10-28 against [SAMHSA](https://www.samhsa.gov/mental-health/988/faqs), [988.ca](https://988.ca) and [Samaritans](https://www.samaritans.org/samaritans-ireland/about/). Check again before launch, and add a country to `CRISIS_LINES` in `packages/shared` if needed.

## 2. Hosted Supabase project

- [ ] Run every migration with `supabase db push`. Run `npm test` against a local copy first.
- [ ] Set the minimum password length to at least 8 (Authentication → Email). ([Supabase: Password security](https://supabase.com/docs/guides/auth/password-security))
- [ ] Turn email confirmations on.
- [ ] Invite-only sign-up: make sure the Before User Created hook is on. `scripts/go-live.sh` turns it on when `SUPABASE_ACCESS_TOKEN` is set. If not, turn it on in Dashboard → Authentication → Hooks (INVITES.md). Test it: sign-up without a code must be refused.
- [ ] Create the pilot's invite codes in Admin → Invite codes and share one with each tester or group.
- [ ] Confirm the `post-media` bucket is private. The security test checks this locally.
- [ ] Confirm backups are on (DEPLOY.md §3) and do one test restore.
- [ ] **Never run `npm run seed:demo` here.** It refuses to run against a non-local database. Pilot content comes from real people.

## 3. API and worker

- [ ] Set the secrets only on the server: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, and optionally `STATION_API_KEY`, `EXPO_ACCESS_TOKEN`, `SMTP_URL` and `MAIL_FROM` (invite emails, digest, sponsor report), and `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` with `MODERATION_PROVIDER`. None of them may go in the mobile app.
- [ ] Set `RATE_LIMIT_PER_MINUTE` (default 300 per member).
- [ ] Set `CORS_ORIGINS` if a web build is hosted. Native apps don't need it.
- [ ] Make sure the worker is running. Reminders, prompts, moderation scans, activity flags and push notifications depend on it.
- [ ] Check that `GET /health` returns `{"ok":true}`, and set up the uptime check (DEPLOY.md §4).

## 4. People and roles

- [ ] Give the first admin their role: `npm run grant-role -- <email> admin`.
- [ ] Assign at least one **moderator** who checks the queue daily, and name a backup.
- [ ] Assign a **pastor_counselor** and at least one **prayer_partner** if prayer partners stay on. Assign **witness** members if the Witness team is used.
- [ ] Agree who answers crisis flags, and how quickly. Give every moderator, pastor and prayer partner [STAFF_HANDBOOK.md](STAFF_HANDBOOK.md).

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
- [ ] Upload to TestFlight. Step by step: [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md). Internal testers (up to 100 team members) need no review. External testers need a build approved by Beta App Review, a beta description and review notes. Give the reviewer a demo login on the hosted project, created by hand and not with the seed. ([TestFlight](https://developer.apple.com/testflight/))
- [ ] Put the Android build on a Play internal testing track, if Android members are included ([ANDROID_PLAY_GUIDE.md](ANDROID_PLAY_GUIDE.md)).
- [ ] Make sure push notifications arrive on a real device for a prayer, a message and an event reminder.

## 7. Final checks

- [ ] `npm test`: all server and station tests pass, including the security checks.
- [ ] `npm run test:e2e`: all 26 end-to-end tests pass locally (including the WCAG scans). Also try VoiceOver and the largest text size on a real iPhone.
- [ ] Do one manual pass on a real phone: sign in, post, pray, commit, message, RSVP, report, and delete the account.
- [x] **Feedback channel.** Members tap Me → Send feedback. Admins triage it under Admin → Triage and export feedback: each item is tagged by type, with suggested tags already filled in, and admins set how serious it is, add a note, filter by tag and export it as CSV. Tell members it's there.
- [ ] Rollback plan: keep the previous build in TestFlight, and take a database backup before each migration. Launch day itself, with rollback steps and who to call: [PILOT_DAY_ONE_RUNBOOK.md](PILOT_DAY_ONE_RUNBOOK.md).

## 8. During the pilot (weekly)

- [ ] Read the admin pilot report (`/admin/pilot-report`) and the metrics.
- [ ] Fill in [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md) from the pilot report CSV for the sponsorship ask.
- [ ] Clear the moderation queue, appeals and activity flags.
- [ ] Collect member feedback and answer the open questions listed in the PR.
