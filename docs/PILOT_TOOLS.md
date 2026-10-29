# Pilot tools

Three tools for running the pilot. Each one is off until an admin turns it on in **Admin → Pilot tools**.

## "Tell Steve"

- **Switch:** "Tell Steve" button. The name can be changed under *Founder's name*.
- **What members see:** a button on the feed and on Me, labeled "Tell Steve". It opens the feedback form, titled with the founder's name.
- **Where it goes:** the same feedback inbox as before, under Admin → Feedback (`/feedback-triage`).

## Weekly feedback summary

- **Switch:** Weekly feedback summary. A second switch, *Also email it*, sends the summary by email as well. Email needs `SMTP_URL` to be set.
- **When it runs:** Mondays at 07:30 UTC, through the `feedback_summary_weekly` job. It covers the previous Monday-to-Monday week and sends once per week, even if the job runs again.
- **What admins get:** a notice, and optionally an email, with:
  - new items, broken down into bugs, ideas and other
  - open items and blockers
  - errors logged that week
  - the 5 newest items
- **Admin view:** `GET /admin/feedback-summary` returns this week's numbers at any time.

## Error log

- **Switch:** Error log. Open it from **Admin → Pilot tools → Open the error log** (`/error-log`).
- **What it catches:**
  - App crashes, through the screen error boundary and the uncaught-error handlers.
  - App bugs behind a failed action.
  - Any API answer of 500 or above.
- **What is logged:** each error once, with how often it happened, where it happened (the screen, or the route pattern), the platform, the app version, and the last member it happened to.
- **What is scrubbed:** ids, email addresses and long numbers are taken out before saving. That way the same error is grouped into one row.
- **Mark fixed:** marks an error resolved. It opens again if the error happens again.
- **What members see:** never error details. A message the server wrote for members, such as "Not enough tokens", is shown as it is. Anything else shows "Something went wrong. Please try again." A feed card that fails to load stays hidden, so the member never sees an error card.
- **While the log is off:** nothing is kept. The app's reports are accepted and dropped.

Tables: `pilot_tools_settings`, `error_reports`, `feedback_summaries` (migration `20261029070500_pilot_tools.sql`).
