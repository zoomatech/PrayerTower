# Privacy audit: where member data goes

Done 2026-10-28 against the code on `main`, the privacy policy draft ([legal/PRIVACY_POLICY_DRAFT.md](legal/PRIVACY_POLICY_DRAFT.md)) and the store answers ([store/APP_PRIVACY_ANSWERS.md](store/APP_PRIVACY_ANSWERS.md)). Each place data goes was traced in the code. Where the code broke a promise, the code was fixed. Where the code is right but the policy is silent or wrong, the change is listed for the lawyer under "Policy changes for counsel".

## Summary

| Where data goes | What goes there | Matches the policy? | Done |
|---|---|---|---|
| Server logs | Method, route, status, timing, IP. No bodies, no sign-in tokens, no cookies, no station key. | **Was broken**: a database error's `detail` (for example "Key (email)=(ruth@…) already exists") went into the log. | **Fixed.** Errors are logged with their kind, message, code and stack only. |
| Crash reports (Sentry, off without a DSN) | App: stack trace, device, app version. Server: route, method, URL with ids. No user, headers, bodies, query values or console logs. | Yes. Checked with a stand-in Sentry server on 2026-10-28 ([MONITORING.md](MONITORING.md)). | None needed |
| Push notifications | The notification text, through Expo, then APNs. A message notice includes up to 120 characters of the message. | Yes ("the notification text"). | Counsel note 6 |
| Emails | Sign-up and password emails (Supabase Auth), invite codes, the weekly digest (other members' answered requests, now without sensitive or blocked ones), the sponsor report. All go through the SMTP service in `SMTP_URL`. | **No.** The SMTP service isn't listed, and invite emails go to people who aren't members. | Counsel notes 1, 2 |
| AI safety check | Post, comment, message and event text, without a name. Also the text a member is about to post, checked before posting (`/moderation/precheck`). OpenAI by default (`MODERATION_PROVIDER=openai`). | Mostly. The pre-post check isn't mentioned, and the Claude option's retention isn't stated. | Counsel notes 3, 4 |
| Staff audit log | Who did what, with the request body. | **Was broken**: the CSV member list (names and emails of people who aren't members yet) and invitees' email addresses were kept forever. | **Fixed.** The CSV is logged as a line count, the invitee's email is left out, and any other email address becomes `[email]`. |
| Download my data | Everything the member wrote or that belongs to their account. Staff-only fields and other people's identities in staff fields are left out. | Yes | None needed |
| Account deletion | Sign-in, profile, everything listed in the policy. | **Was broken**: settings stayed on the "Deleted member" record, including the quiet-hours time zone (a hint of where the member lives), digest, language and reminder settings. | **Fixed.** Every setting goes back to its default. |
| Backups | Supabase daily backups (Pro: 7 days). Our own `scripts/backup-db.sh` dumps. | **Was broken**: our own dumps were never deleted, so deleted members came back in every old dump. | **Fixed.** The script deletes its dumps after `KEEP_DAYS` (default 30). |

## Code changes

1. **Logs drop database row values.** `logSafeError` in `apps/server/src/app.ts` is the log serializer for errors. Test: `observability.test.ts` makes a real duplicate-key error with an email in its detail and checks that the logged error doesn't contain it.
2. **Deletion resets every setting.** `deleteAccount` in `apps/server/src/modules/accounts/index.ts`. Test: `account-deletion.test.ts` sets quiet hours with a time zone, the digest and other settings, deletes the account, and checks every value is back to its default.
   - Since 2026-10-29, `deleteTheRest` also deletes every row in any table that points at the member with `on delete cascade` (the profile row stays for the ledger, so those cascades never fire on their own). `account-deletion.test.ts` checks no such row is left. Kept on purpose: emptied ledger-held requests, group chats the member started (without their messages), and staff safety records.
   - The export has a matching guard: `export.test.ts` fails when a table points at a member and is neither exported nor listed in `NOT_EXPORTED`.
3. **The staff audit log keeps invitees out.** `bodyOf` in `apps/server/src/modules/audit/index.ts`. Test: `audit-log.test.ts` imports a CSV with two people and makes an invite whose note has an email, then checks that no name or email is in the log.
4. **Own backups expire.** `scripts/backup-db.sh` deletes only the dated folders it made, older than `KEEP_DAYS`. Tested on folders dated 60 days ago and today, plus an unrelated folder (only the old dated one was removed).

## Policy changes for counsel

These are flagged, not made: the policy is the lawyer's document.

1. **Add the email service.** Section 4 needs a row such as "[EMAIL PROVIDER] (sends email) | Sign-up and password emails, invite codes, the weekly email | Your email address and the email's text". The weekly email quotes short pieces of other members' answered requests, so those pieces sit in members' mailboxes, outside our control. Section 1's Account row says email is used "only if you turn on the weekly email"; sign-up confirmations and password resets use it too.
2. **People who aren't members.** Admins can import a church's member list (name and email) and email invite codes. The policy doesn't cover people who haven't signed up. The invite's note keeps the name or email so admins know who got which code, and invites are never deleted. Decide whether to state this, and whether invite notes should be cleared some time after the code is used or expires (a configurable purge can be added).
3. **The pre-post check.** Before a post or message is sent, its text goes to the safety check so the app can show the rules first. Text a member then decides not to post has still been sent. Section 2 should say "including text you are about to post".
4. **The Claude option's retention.** If `MODERATION_PROVIDER=claude`, Anthropic says it deletes API inputs and outputs "within 30 days of receipt or generation", but keeps inputs and outputs flagged by its safety systems "for up to 2 years" ([Anthropic Privacy Center](https://privacy.claude.com/en/articles/7996866-how-long-does-anthropic-store-my-organizations-data)). Crisis posts are the ones most likely to be flagged. OpenAI's `/v1/moderations` has no abuse-monitoring retention ([OpenAI: your data](https://developers.openai.com/api/docs/guides/your-data)). The pilot uses OpenAI. If Claude is ever chosen, the policy row must say this.
5. **Log retention.** The policy says server logs are kept for [30] days. Fly.io says "We currently retain logs for 7 days" ([Fly.io: search logs](https://docs.fly.io/monitoring/search-logs)). Put 7, or set up a log store that keeps 30.
6. **Backups.** "Database backups roll off within [7 / 30] days." Supabase: "Pro Plan projects can access the last 7 days of daily backups", and Free projects get none ([Supabase: backups](https://supabase.com/docs/guides/platform/backups)). Our own dumps now expire after 30 days. So the honest wording is "within 30 days". A restore from a backup could bring back an account deleted after that backup; the runbook should delete such accounts again after any restore.
7. **What stays after deletion, beyond the three listed.** Tied only to the anonymous "Deleted member":
   - Group chats the member started keep their title and topic, because the other members still use them.
   - Token pools the member started keep their name and purpose, because other members' tokens are in them.
   - Other members' notifications can quote the deleted member's name and message text, until those notifications expire after 90 days.
   - The staff audit log has no time limit.
   Section 5 should name these, or the code can clear them (say which).
8. **Push text on the lock screen.** A message notice shows up to 120 characters of the message on the recipient's lock screen. The policy covers that the text goes to Apple. Decide whether members should be able to turn previews off in the app (iOS already lets them hide previews in Settings → Notifications).
9. **Store answers.** `APP_PRIVACY_ANSWERS.md` (App Store only; the pilot is iPhone only) now lists the email service, the Claude option and server error reports. Recheck the label if `MODERATION_PROVIDER` changes.

## What was checked and is fine

- **Logged URLs** hold only ids and the `before`, `comment` and `postId` query values, never text a member wrote.
- **The safety check** sends the text alone, never the member's name or id (`moderation/scanTask` and the classifiers).
- **The radio** logs only the prayer and request ids.
- **The export** includes notifications addressed to the member (which can quote others' messages to them) and leaves out staff fields such as who claimed a care request or decided an appeal.
- **Sentry**, server and app, strips user, headers, cookies, bodies and query strings in `beforeSend`, on top of the SDK's own settings.
