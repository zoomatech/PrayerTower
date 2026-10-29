# Gentle reminders

Two switches in **Admin → Gentle reminders**, both off until an admin turns them on
(migration `20261029091100_gentle_reminders.sql`).

## Daily reminder

A member picks a time and the days of the week on **Me → Daily reminder**. The time is
kept in their own time zone, so it stays at 07:30 across clock changes.

- **Skipped on a day they already prayed.** No notice at all on those days.
- **Never twice a day.** Each reminder carries the member's local date as its dedupe key.
- **No guilt.** The three rotating lines never mention a missed day, a count or a streak.
  Open Circle members get the same lines with no religious words
  (`notifications/i18n.ts`, keys `daily_reminder_0..2`).
- **Slows down quietly.** After *Unused reminders before it slows to weekly* (default 7,
  3–60) reminders in a row went by with no prayer, it sends at most once a week. The
  first prayer puts it back on the member's own days. The member is never told.
- **Push delivery.** It goes through the normal notice path, so the member's own
  notification settings, quiet hours and (when on) Push delivery folding and caps apply.

The worker job `reminders_daily_due` runs every 5 minutes. A member turns their reminder
off on the same card, and their reminder is in their data download (`dailyReminder`).

## Weeks of prayer

In place of "days in a row", Me shows:

- **Weeks of prayer**: weeks with at least one prayer. It only ever goes up.
- **Weeks in a row**, shown only from 2 up. One rest week between prayed weeks keeps the
  run going, and a week that has just started counts last week's run. When a run ends,
  nothing says so: the total stays.

Open Circle members see "Weeks of kindness".
