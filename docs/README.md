# Prayer Tower docs

Every current doc, grouped by who it's for. The pilot is **English only** and **iPhone only** (iPad and Mac run the same iOS app), and the default branch is `main`. Android, Spanish and load-test docs are not current; they are in [archive/](archive/README.md). The same files are in the repo under `docs/` and in the project files under `docs/`. Last checked 2026-10-28.

## Steve (owner)

| Doc | What it's for |
|---|---|
| STEVE_TODO.md (project files, top level) | Everything that needs you: accounts, keys, decisions, signatures |
| [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md) | Everything to finish before inviting the 10 pilot members |
| [PILOT_DAY_ONE_RUNBOOK.md](PILOT_DAY_ONE_RUNBOOK.md) | Launch day hour by hour, when and how to roll back, and who to call |
| [GO_LIVE.md](GO_LIVE.md) | Deploying to Fly.io or Render with Supabase Cloud, with one script |
| [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md) | Getting the iPhone app onto TestFlight from your Mac |
| [MAC_AND_IPAD.md](MAC_AND_IPAD.md) | The iPad and Mac versions of the iOS app |
| [MAC_BUILD.md](MAC_BUILD.md) | One command on the Mac that builds the iPhone app, the Mac app and the widget, and reports the results |
| [PRAY_NOW_WIDGET.md](PRAY_NOW_WIDGET.md) | The "Pray now" home-screen widget |
| [BRANDING.md](BRANDING.md) | The three draft app icons and how to switch them |
| [INVITES.md](INVITES.md) | Invite-only sign-up and invite codes |
| [CSV_IMPORT.md](CSV_IMPORT.md) | Loading a church's members (as invites) and starter requests from a spreadsheet |
| [CHURCH_PARTNERS.md](CHURCH_PARTNERS.md) | Church partners and pastor badges |
| [TESTIMONIES_AND_STATS.md](TESTIMONIES_AND_STATS.md) | Answered-prayer testimonies and prayer stats on Me |
| [NOTEBOOK_FEATURES.md](NOTEBOOK_FEATURES.md) | Notebook ideas with their own switches: worldwide count, thanksgiving card, notes for event hosts, "positive thoughts welcome" |
| [RADIO_STATION.md](RADIO_STATION.md) | How radio prayers go out, and the radio rules |
| [RADIO_STATION_INSTALL.md](RADIO_STATION_INSTALL.md) | Installing the station on a Raspberry Pi or Debian laptop |
| [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md) | Pilot results for the sponsorship ask |
| [ABUSE_TESTS.md](ABUSE_TESTS.md) | Spam and token-farming attacks we tested, and the limits that stop them |

The product plans are in the project files under `roadmap/`: the product roadmap, the V1 architecture, the community data model and the Phase 3 gap list.

## Pilot members

| Doc | What it's for |
|---|---|
| [pilot/README.md](pilot/README.md) | The onboarding kit: what to send and when |
| [pilot/INVITE_EMAIL.md](pilot/INVITE_EMAIL.md) | Invite email templates |
| [pilot/TESTER_INSTRUCTIONS.md](pilot/TESTER_INSTRUCTIONS.md) | How testers install the app, what to try and how to report problems |
| [pilot/FEEDBACK_SURVEY.md](pilot/FEEDBACK_SURVEY.md) | Survey questions to paste into Google Forms or Microsoft Forms |

## Staff (moderators, pastors, prayer partners)

| Doc | What it's for |
|---|---|
| [STAFF_HANDBOOK.md](STAFF_HANDBOOK.md) | Each tool and button, the daily routine, and what to do when someone may be in danger |
| [PILOT_DAY_ONE_RUNBOOK.md](PILOT_DAY_ONE_RUNBOOK.md) | Who does what on launch day |
| [policy/PROSELYTIZING_RULE_DRAFT.md](policy/PROSELYTIZING_RULE_DRAFT.md) | Draft community rule on sharing faith without pressuring people |
| [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) | Admins: failed background jobs, Retry and Discard, and the alerts |
| [MONITORING.md](MONITORING.md) | Admins: Admin → Operations and the "needs attention" alert |

## App stores

| Doc | What it's for |
|---|---|
| [store/STORE_LISTING.md](store/STORE_LISTING.md) | App Store name, subtitle, description and keywords |
| [store/WHATS_NEW.md](store/WHATS_NEW.md) | "What's New" text for version 1.0 |
| [store/REVIEW_NOTES.md](store/REVIEW_NOTES.md) | Notes and the demo account plan for Apple's reviewers |
| [store/APP_PRIVACY_ANSWERS.md](store/APP_PRIVACY_ANSWERS.md) | Answers for Apple's privacy label |
| Store screenshots (project files, `store-screenshots/`) | iPhone and iPad screenshots |

## Legal (needs a lawyer's review)

| Doc | What it's for |
|---|---|
| [legal/PRIVACY_POLICY_DRAFT.md](legal/PRIVACY_POLICY_DRAFT.md) | Privacy policy draft |
| [legal/TERMS_OF_USE_DRAFT.md](legal/TERMS_OF_USE_DRAFT.md) | Terms of use draft |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | Security review for the pilot |

## Developers

| Doc | What it's for |
|---|---|
| [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md) | **Start here.** How the system fits together, how to run it and add a feature, and every setting |
| [API.md](API.md) | The API reference (OpenAPI) and how to open it |
| [DEPLOY.md](DEPLOY.md) | Running the server on a machine you manage yourself |
| [STAGING.md](STAGING.md) | The staging copy used to try releases |
| [RELEASING.md](RELEASING.md) | The changelog and release notes |
| [BACKUP_RESTORE.md](BACKUP_RESTORE.md) | Backups and the restore drill |
| [MONITORING.md](MONITORING.md) | Health checks, uptime alerts and Admin → Operations |
| [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) | Job retries, the failed-jobs list and alerts |
| [APP_LINKS.md](APP_LINKS.md) | Shared links that open the app |
| [SECURITY_SCANNING.md](SECURITY_SCANNING.md) | Dependabot, npm audit and CodeQL |
| [CODE_HEALTH.md](CODE_HEALTH.md) | Strict TypeScript, ESLint and the test coverage report |
| [QUERY_AUDIT.md](QUERY_AUDIT.md) | Slow-query audit at 1,000 members ([full results](QUERY_AUDIT_RESULTS.md)) |
| [ABUSE_TESTS.md](ABUSE_TESTS.md) | Abuse tests and the limits |
| MAESTRO_TESTS.md (project files; in the repo, `apps/mobile/.maestro/README.md`) | Native app tests to run on a Mac |
| `apps/e2e/README.md` (repo) | Web end-to-end and accessibility tests |
| `CHANGELOG.md` (repo) | What changed in each pull request |

## Outdated or needing attention

Checked on 2026-10-28 (Batch 9).

| Doc | Status |
|---|---|
| Android, Spanish and load-test docs | **Archived** in [archive/](archive/README.md). Not part of the pilot: English only, iPhone only, no load tests. |
| Google Play sections of the store docs, TestFlight guide and widget doc | **Archived** in [archive/GOOGLE_PLAY_DRAFTS.md](archive/GOOGLE_PLAY_DRAFTS.md). |
| Default branch | **Fixed.** It is `main`; the docs no longer say otherwise. |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | **Out of date.** It reviewed 143 routes. Routes added since then, such as the CSV import, the failed-jobs admin, invite emails, the API docs and Operations, are covered by tests but not by the written review. Review it again before the pilot grows. |
| [legal/](legal/PRIVACY_POLICY_DRAFT.md) drafts | Drafts until a lawyer reviews them (STEVE_TODO). |
| [STAFF_HANDBOOK.md](STAFF_HANDBOOK.md) §3 (crisis) | Needs a licensed counselor's review before the pilot (STEVE_TODO). |
