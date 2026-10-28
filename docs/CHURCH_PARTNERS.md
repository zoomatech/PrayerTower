# Church partners and pastor badges

A pastor can add their church from **Me → Are you a pastor? Add your church**. An admin checks the church and verifies it. The pastor then gets the `pastor` role and a badge on the requests they post under their name.

## How it works

1. **The pastor applies.** They give the church's name, their title (for example Senior Pastor), city, country, and optionally the denomination, website, phone and a note. A member can have one open application at a time. While it's pending they can edit or withdraw it.
2. **An admin checks the church.** Go to **Admin → Church partner applications** (the `/churches` screen). Check each church before verifying it: call the number, open the website, or look the church up in its denomination's directory.
3. **The admin decides.**
   - **Verify:** the church becomes verified. The applicant gets the `pastor` role and a notice.
   - **Decline:** needs a note, which the pastor sees in their notice and on the My church screen. The pastor can then apply again.
   - **Revoke** (for a verified church): needs a note, removes the `pastor` role and the badge, and tells the pastor why.
4. **The badge.** Cards, the pastor's profile and events they host show "✝ Senior Pastor · Grace Chapel". The badge never shows on an anonymous post.
5. **Trusted from day one.** Because an admin checked the church, a verified pastor skips the new-member limits (posts and comments per day, links, asking others to pray, hosting events), the same as staff. Revoking the church puts the limits back if the account is still new.

The `pastor` role is separate from `pastor_counselor`, which is the role for the care-request rotation. Verifying a church does not put the pastor into that rotation. If they should be in it, an admin grants `pastor_counselor` as well.

Every verify, decline and revoke goes to the staff audit log. The application is included in "Download my data" and is deleted with the account.

## API

| Method | Path | Who |
| --- | --- | --- |
| GET | `/me/church` | the member: their latest application, or null |
| POST | `/me/church` | apply (409 if one is already open) |
| PUT | `/me/church` | edit a pending application |
| DELETE | `/me/church` | withdraw a pending application |
| GET | `/admin/churches?status=pending\|verified\|declined` | admins |
| POST | `/admin/churches/:id/decision` | admins: `{ decision: 'verify' \| 'decline' \| 'revoke', note? }` |

## Open questions (defaults in use)

- **What counts as verified.** The default is an admin's manual check. Steve may want a stricter rule, such as a letter from the church or a listing in a denomination directory.
- **What pastors can do beyond the badge.** Default: the badge plus skipping the new-member limits. They can already host events and start groups like any member. They can't schedule restorative circles or join the care rotation unless an admin also grants `pastor_counselor`.
