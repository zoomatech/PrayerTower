# Prayer Tower docs

Every doc, grouped by who it's for. The same files are in the repo under `docs/` and in the project files under `docs/`. Last checked 2026-10-28.

## Steve (owner)

| Doc | What it's for |
|---|---|
| STEVE_TODO.md (project files, top level) | Everything that needs you: accounts, keys, decisions, signatures |
| [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md) | Everything to finish before inviting the 10 pilot members |
| [PILOT_DAY_ONE_RUNBOOK.md](PILOT_DAY_ONE_RUNBOOK.md) | Launch day hour by hour, when and how to roll back, and who to call |
| [GO_LIVE.md](GO_LIVE.md) | Deploying to Fly.io or Render with Supabase Cloud, with one script |
| [TESTFLIGHT_EAS_GUIDE.md](TESTFLIGHT_EAS_GUIDE.md) | Getting the iPhone app onto TestFlight from your Mac |
| [ANDROID_PLAY_GUIDE.md](ANDROID_PLAY_GUIDE.md) | Getting the Android app onto Google Play internal testing |
| [ANDROID_PUSH.md](ANDROID_PUSH.md) | Setting up Firebase so Android phones get push notifications |
| [MAC_AND_IPAD.md](MAC_AND_IPAD.md) | The iPad and Mac versions of the iOS app |
| [PRAY_NOW_WIDGET.md](PRAY_NOW_WIDGET.md) | The "Pray now" home-screen widget |
| [BRANDING.md](BRANDING.md) | The three draft app icons and how to switch them |
| [INVITES.md](INVITES.md) | Invite-only sign-up and invite codes |
| [CSV_IMPORT.md](CSV_IMPORT.md) | Loading a church's members (as invites) and starter requests from a spreadsheet |
| [CHURCH_PARTNERS.md](CHURCH_PARTNERS.md) | Church partners and pastor badges |
| TESTIMONIES_AND_STATS.md (project files) | Answered-prayer testimonies and prayer stats on Me |
| [RADIO_STATION.md](RADIO_STATION.md) | How radio prayers go out, and the radio rules |
| [RADIO_STATION_INSTALL.md](RADIO_STATION_INSTALL.md) | Installing the station on a Raspberry Pi or Debian laptop |
| [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md) | Pilot results for the sponsorship ask |
| [ABUSE_TESTS.md](ABUSE_TESTS.md) | Spam and token-farming attacks we tested, and the limits that stop them |
| [LOAD_TEST.md](LOAD_TEST.md) | How many members one small server handles (100 comfortably) |

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

## App stores

| Doc | What it's for |
|---|---|
| [store/STORE_LISTING.md](store/STORE_LISTING.md) | App name, subtitle, description and keywords for both stores |
| [store/WHATS_NEW.md](store/WHATS_NEW.md) | "What's New" text for version 1.0 |
| [store/REVIEW_NOTES.md](store/REVIEW_NOTES.md) | Notes and the demo account plan for Apple and Google reviewers |
| [store/APP_PRIVACY_ANSWERS.md](store/APP_PRIVACY_ANSWERS.md) | Answers for Apple's privacy label and Play's Data safety form |
| Store screenshots (project files, `store-screenshots/`) | iPhone, iPad and Android screenshots |

## Legal (needs a lawyer's review)

| Doc | What it's for |
|---|---|
| [legal/PRIVACY_POLICY_DRAFT.md](legal/PRIVACY_POLICY_DRAFT.md) | Privacy policy draft ([Spanish](legal/PRIVACY_POLICY_DRAFT.es.md)) |
| [legal/TERMS_OF_USE_DRAFT.md](legal/TERMS_OF_USE_DRAFT.md) | Terms of use draft ([Spanish](legal/TERMS_OF_USE_DRAFT.es.md)) |
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
| [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) | Job retries, the failed-jobs list and alerts |
| [APP_LINKS.md](APP_LINKS.md) | Shared links that open the app |
| [LOCALIZATION.md](LOCALIZATION.md) | English and Spanish in the app and in emails |
| SPANISH_REVIEW_CHECKLIST.md (project files) | Every Spanish string beside the English, for a native speaker |
| [SECURITY_SCANNING.md](SECURITY_SCANNING.md) | Dependabot, npm audit and CodeQL |
| [CODE_HEALTH.md](CODE_HEALTH.md) | Strict TypeScript, ESLint and the test coverage report |
| [QUERY_AUDIT.md](QUERY_AUDIT.md) | Slow-query audit at 1,000 members ([full results](QUERY_AUDIT_RESULTS.md)) |
| [LOAD_TEST.md](LOAD_TEST.md) | Load test method and results |
| [ABUSE_TESTS.md](ABUSE_TESTS.md) | Abuse tests and the limits |
| MAESTRO_TESTS.md (project files; in the repo, `apps/mobile/.maestro/README.md`) | Native app tests to run on a Mac |
| `apps/e2e/README.md` (repo) | Web end-to-end and accessibility tests |
| `CHANGELOG.md` (repo) | What changed in each pull request |

## Outdated or needing attention

Checked on 2026-10-28.

| Doc | Status |
|---|---|
| Project files copies of ANDROID_PLAY_GUIDE, DEPLOY, DEVELOPER_HANDOFF, INVITES, PRAY_NOW_WIDGET, TESTFLIGHT_EAS_GUIDE, PRIVACY_POLICY_DRAFT and STORE_LISTING | **Fixed.** They were older than the repo and have been replaced. APP_LINKS, QUERY_AUDIT_RESULTS and the two Spanish legal drafts were missing from the project files and have been added. |
| [DEVELOPER_HANDOFF.md](DEVELOPER_HANDOFF.md) | **Fixed.** It described main at PR #12. It now lists the newer settings (email, app links, API docs, Sentry) and every scheduled job. |
| [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md) | **Fixed.** It said 17 end-to-end tests (now 26) and left out the email and Claude moderation settings. |
| [SECURITY_REVIEW.md](SECURITY_REVIEW.md) | **Out of date.** It reviewed 143 routes. Routes added since then, such as the CSV import, the failed-jobs admin, invite emails and the API docs, are covered by tests but not by the written review. Review it again before the pilot grows. |
| [LOAD_TEST.md](LOAD_TEST.md) | Still valid. It was run before the query-audit indexes, which only make it faster. |
| [legal/](legal/PRIVACY_POLICY_DRAFT.md) drafts | Drafts until a lawyer reviews them (STEVE_TODO). |
| [STAFF_HANDBOOK.md](STAFF_HANDBOOK.md) §3 (crisis) | Needs a licensed counselor's review before the pilot (STEVE_TODO). |
| SPANISH_REVIEW_CHECKLIST.md | Generated from the code. Run it again after strings change. |
