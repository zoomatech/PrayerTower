# Answered-prayer testimonies and gentle prayer stats

## Testimonies

When a member marks their request answered, they can also say what God did. They can share the testimony at that moment, or add, edit or remove it later from the request's page.

- **Where it shows:** under the request on its card, with a gold "Testimony" label.
- **Testimonies filter:** above the feed, **All prayers | Testimonies**. The Testimonies view lists answered requests that have a testimony, plus posts of the Testimony type, newest first, from the past year. It follows the feed's usual rules: blocked members are left out, as are hidden posts and sensitive posts for members who opted out.
- **Telling the pray-ers:** everyone who prayed for the request or committed to it gets one notice ("A prayer you prayed was answered"), in the Encouragement group. Editing the testimony doesn't send another. An anonymous poster stays "Someone".
- **Moderation:** the testimony is scanned like the request text. Crisis wording shows crisis support and flags the request for moderators.
- **Deletion:** deleting the request or the account removes the testimony, and so does the retention job.

API:
- `POST /posts/:id/answered { testimony? }`
- `PUT /posts/:id/testimony { body }`
- `DELETE /posts/:id/testimony`
- `GET /feed?filter=testimonies`

## Gentle prayer stats (Me)

"Your prayer life" on Me shows three numbers:
- **Days prayed**
- **People prayed for** (other people only)
- **Days in a row**

Under them are seven dots for the past week.

- **Gentle by design:**
  - Only the member sees these numbers.
  - There is no leaderboard.
  - A streak still counts until a whole day is missed. If you haven't prayed yet today, yesterday's run stands.
  - When there's no streak, the copy says "a missed day costs nothing".
- **Off switch:** Me → Settings → **Show my prayer stats** (on by default). When it's off, the server returns no numbers.
- **Days** are counted in the phone's time zone: `GET /me/prayer-stats?tz=America/Chicago`.
