# Legal requests and evidence holds

Admin → **Legal requests** (off by default) gives staff one place to record a request from law enforcement, or a report a moderator thinks police should see, and to keep evidence safe while staff decide what to do. Source: Notes p14, "law enforcement and consequences for bad actors".

**The app never contacts anyone or sends anything outside.** It records, preserves and exports. What is disclosed, to whom and when is a staff decision made outside the app.

## Switch it on

Admin → Legal requests → "Legal requests and evidence holds". While it is off, no case or hold can be made and the moderators' escalate button is hidden (the server also refuses). Closing old cases and releasing holds still work.

## Cases

| Kind | Use it for |
| --- | --- |
| Preservation request | An agency asks you to keep an account's records |
| Subpoena or court order | Legal process asking for records |
| Emergency request | An agency says someone is in immediate danger |
| Our own referral | A moderator escalated a report (made automatically) |

Each case has the agency, its reference number, the member it is about (@handle), a summary and dated notes ("what was sent, to whom, when").

## Moderator escalation

When the switch is on, each item in the moderation queue has **Ask the admins for a law-enforcement review**. It opens a referral case about the member who posted it (once per item) and notifies every admin. The item stays in the queue for a normal decision.

## Evidence holds

**Place a hold** on a case copies, as of that moment:

- the member's profile record,
- every post, comment and message they sent,
- their moderation history (reports about them and actions taken).

The copy survives the member deleting things, the nightly clean-up of removed content, and account deletion. **Add anything new** copies what they posted since. **Export** downloads the copy as JSON.

A hold lasts 90 days by default (`legal_settings.default_hold_days`), then the nightly job `legal_holds_expire` (03:10 UTC) releases it. **Release and erase** or **Close the case** erases the copy at once. The hold record (who, when, until when) is kept.

## Privacy

- Admins only. Every action is in the audit log, but case text and notes are not copied into it.
- Data: migration `20261029004800_legal_cases.sql`; code `apps/server/src/modules/legal/`.
