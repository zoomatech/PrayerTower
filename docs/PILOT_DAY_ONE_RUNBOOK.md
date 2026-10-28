# Pilot day-one runbook

Launch day for the first 10 members, hour by hour. Finish [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md) first: this page assumes the hosted stack is deployed, the builds are in TestFlight and Play internal testing, and the invite codes exist. Times are local and only a guide. "T" is the moment the first invite goes out; the default is 10:00.

## Who to call

Fill in the names and numbers before launch day. Everyone on this list gets a copy of this page.

| Role | Person | How to reach | Covers |
|---|---|---|---|
| Launch lead (decides on rollback) | Steve | [phone] | Go or no-go, rollback, anything not listed here |
| Admin on duty | [name] | [phone] | Invite codes, Admin screens, roles, settings |
| Moderator on duty | [name] | [phone] | The moderation queue, reports, crisis flags |
| Backup moderator | [name] | [phone] | Takes over if the moderator on duty can't answer within 15 minutes |
| Pastor or counselor | [name] | [phone] | Care requests and crisis follow-up ([STAFF_HANDBOOK.md](STAFF_HANDBOOK.md) §3) |
| Developer | Claude in this project, or [name] | Project chat | Bugs, deploys, rollbacks, logs |

If someone may be in immediate danger, call 911 (or the local emergency number) first. In the US, point the member to call or text **988** ([988 Lifeline](https://988lifeline.org/help-someone-else/support-on-social-media/)).

| Service | Status page | Support |
|---|---|---|
| Fly.io (API, worker, web app) | [status.flyio.net](https://status.flyio.net/) | [community.fly.io](https://community.fly.io) for everyone. Email and the dashboard Support tab need a paid support plan. ([Fly.io support](https://docs.fly.io/about/support)) |
| Supabase (database, sign-in, photos) | [status.supabase.com](https://status.supabase.com/) | Dashboard → Support, or [supabase.com/dashboard/support/new](https://supabase.com/dashboard/support/new). Paid projects only. You don't need a ticket while a listed incident is open. ([Supabase support policy](https://supabase.com/support-policy)) |
| Apple (TestFlight) | [Apple Developer system status](https://developer.apple.com/system-status/) | App Store Connect → Help |

## The day before (T − 1 day)

- [ ] Take a fresh backup: `scripts/backup-db.sh` ([BACKUP_RESTORE.md](BACKUP_RESTORE.md)). Write down the time.
- [ ] Write down the current Fly image, so you can roll back to it: `fly releases --app prayertower-api --image` ([Fly rollback guide](https://docs.fly.io/blueprints/rollback-guide)).
- [ ] Freeze changes. No deploys or migrations after this point unless they fix a launch problem.
- [ ] Sign in on two iPhones (or one iPhone and the web app) with a staff account. Post, pray, comment, message, and check that the push arrives.
- [ ] Check that sign-up without an invite code is refused.
- [ ] Send the "who to call" table above to everyone on it.

## Launch day

### T − 2 hours (08:00): check the stack

- [ ] `GET https://<API host>/health` returns `{"ok":true}`. The uptime check is green.
- [ ] Fly: `fly status --app prayertower-api` shows one `app` and one `worker` machine, both started.
- [ ] Admin → Operations says "Everything is running" ([MONITORING.md](MONITORING.md)), and Admin → Background jobs shows no failed jobs ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)).
- [ ] Sentry (if `SENTRY_DSN` is set) shows no new errors since yesterday.
- [ ] Fly and Supabase status pages show no incident. If one is open, hold the launch until it is resolved.

### T − 1 hour (09:00): staff in place

- [ ] The moderator on duty and the backup are signed in and can open Admin → Moderation.
- [ ] The pastor or counselor can open the care queue.
- [ ] The admin on duty has the invite codes ready (Admin → Invite codes), or the member list ready for CSV import with **Email each person** ticked ([CSV_IMPORT.md](CSV_IMPORT.md)).
- [ ] Post one welcome announcement (Admin → Announcements), so the feed isn't empty.
- [ ] Go or no-go: Steve decides. If no-go, send nothing and pick a new time.

### T (10:00): send the invites

- [ ] Send the invite email ([pilot/INVITE_EMAIL.md](pilot/INVITE_EMAIL.md)) with each person's code, the TestFlight or Play link and [pilot/TESTER_INSTRUCTIONS.md](pilot/TESTER_INSTRUCTIONS.md).
- [ ] Note who was invited and when.

### T + 1 hour (11:00): first sign-ups

- [ ] Admin → Invite codes: check which codes were used. Message anyone who hasn't started and offer help.
- [ ] Watch for sign-up problems: no confirmation email (check Supabase → Authentication → Logs, and that SMTP is set), "invite code needed" for a valid code (check that the code isn't expired or used up), or the app pointing at the wrong server.
- [ ] Moderator: first look at the queue.

### T + 2 to T + 4 hours (12:00–14:00): first use

- [ ] Every hour: Admin → Operations, Admin → Background jobs, Sentry, and the moderation queue.
- [ ] Check Admin → Triage and export feedback for anything urgent. Answer each person who reported a problem.
- [ ] Confirm that push notifications arrive for a prayer and a message. If they don't, check the worker logs (`fly logs --app prayertower-api`) for push errors.
- [ ] Crisis flags: the moderator reaches out within 15 minutes ([STAFF_HANDBOOK.md](STAFF_HANDBOOK.md) §3).

### T + 6 hours (16:00): midday review

- [ ] Count: invites sent, accounts created, requests posted, prayers, feedback items.
- [ ] Decide on fixes. Small fixes can ship the same day: deploy, then watch `/health` and Sentry for 15 minutes. Anything else waits for tomorrow.

### T + 10 hours (20:00): evening check

- [ ] Same checks as T + 2.
- [ ] Hand over to the night contact. The default is the moderator on duty, who checks once more before bed.

### End of day

- [ ] Write a short day-one note: what worked, what broke, who hasn't signed up. Save it next to [PILOT_RESULTS_TEMPLATE.md](PILOT_RESULTS_TEMPLATE.md).
- [ ] Take another backup.

## When to roll back

Roll back when something hurts members and the fix isn't quick:

- Members can't sign in or post, for more than 15 minutes.
- Data is being lost or shown to the wrong people.
- Errors in Sentry or failed jobs keep rising after a deploy.

Steve decides. If he can't be reached within 15 minutes, the admin on duty decides.

## Rollback steps

Do them in this order, and stop as soon as the problem is gone.

1. **Turn off the broken feature, if it has a switch.** Most features have one in the admin screen (the switches in [PILOT_LAUNCH_CHECKLIST.md](PILOT_LAUNCH_CHECKLIST.md) §5). This is the fastest fix and needs no deploy.
2. **Roll back the API and worker** to the image you wrote down the day before:

   ```bash
   fly releases --app prayertower-api --image
   fly deploy --app prayertower-api --image registry.fly.io/prayertower-api:<previous tag> --ha=false
   fly status --app prayertower-api
   fly logs --app prayertower-api
   ```

   Rolling back the image doesn't change secrets, `fly.toml` settings or the database ([Fly rollback guide](https://docs.fly.io/blueprints/rollback-guide)). If you changed a secret, set it back with `fly secrets set`.
3. **Roll back the web app** the same way, on the web app's Fly app.
4. **The database.** Rolling back the API doesn't undo migrations. So far the migrations add tables, columns and indexes and replace functions, so the previous API normally runs on the newer database. Check the release's migrations before relying on that. Restore a backup only if data was damaged, because a restore loses everything written since that backup. On Supabase Pro, restore from Dashboard → Database → Backups. "The project is inaccessible during this process" ([Supabase backups](https://supabase.com/docs/guides/platform/backups)). Photos in Storage aren't in database backups. To restore your own dump instead, follow [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
5. **The phone app.** If a new build is the problem, expire it: App Store Connect → TestFlight → the build → **Expire Build**. "The build no longer allows internal and external testers to install it" ([Apple](https://developer.apple.com/help/app-store-connect/test-a-beta-version/stop-testing-a-build/)). Then upload a fixed build. On Android, release the previous build again on the internal testing track in Play Console.
6. **Tell the members.** Post an announcement (Admin → Announcements) saying what happened and when it will be fixed.
7. **Write it down.** What broke, when, what you did, and what will stop it happening again.
