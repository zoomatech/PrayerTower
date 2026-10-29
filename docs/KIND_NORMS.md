# Kind norms

Five small nudges toward kindness, taken from `research/Kind_Interaction_UX_Research.md` in the project files (sections 2, 7, 8 and 9), where they were listed as "Idea; not built". Each one is off until an admin turns it on in **Admin → Kind norms**. None of them blocks, hides or holds anything. A person still reviews before anything is blocked.

| Switch | What members see | Research it follows |
| --- | --- | --- |
| **Kindness promise card** | A card at the top of the feed asks them once: "I'll speak gently, pray sincerely, and protect others' stories." Open Circle says "show up sincerely" instead of "pray sincerely". **I promise** saves it; **Not now** puts the card away until next time. Nothing depends on it. An admin can reword the promise, and an empty box goes back to the default. | Pinned rules made newcomers about 8 points more likely to follow them (r/science, PNAS 2019). Discord's rules screening works the same way. |
| **Rules reminder on first replies** | A gentle line above the reply box for a member's first few replies. The default is 3; admins can pick 1, 3, 5 or 10. | Same as above. |
| **Resting threads** | When 3 heated replies (ones the kind cloud would flag) land on one post within 30 minutes, the post rests for 60 minutes. While it rests, each person can reply once every 10 minutes, and the reply box says "This conversation is resting for a moment." Anyone who hasn't replied yet can still reply. Nothing is hidden. An early second reply gets a 429 with how many minutes to wait. All four numbers can be set through `PATCH /admin/kind-norms`. Only *when* a heated reply happened is kept (`thread_heat`), never its words or author. | Slowing a heated exchange works better than locking it. |
| **"This helped" on comments** | A **This helped** link on other people's comments. Top-level comments, with their replies, are ordered by how *widely* they helped: the number of different communities, towns, and new and long-time members among the people who tapped, not the number of taps. A comment that reaches 2 or more extra groups shows "Helpful to many kinds of members". Tap counts are never shown. | Community Notes ranks a note highly only when people who usually disagree both find it helpful (Wojcik et al.). |
| **Authors can offer a private sorry** (needs Gentle notes and Mend on, under Admin → Growth practices) | When someone sends a gentle note about a comment, its author sees **Offer a private sorry** on it. It opens Mend's guided sorry: what I did, that it's on me, what I'll do differently. A moderator reads it before it is delivered to the person who sent the note, who can accept it or close it quietly. The author never learns who it goes to, and it never crosses a block. If several people sent notes, each gets their own sorry, one at a time. | After harassment, an apology was the outcome young people wanted most (62%, University of Michigan). |

"New" means joined within the Growth practices newcomer days (default 14).

## API

- `GET` and `POST /me/kindness-promise`
- `GET /posts/:id/reply-box` returns `{ reminder, resting: { until, gapMinutes } | null }`
- `PUT /comments/:id/helped` with `{ on }`
- `GET /comments/:id/sorry-offer` returns `{ available, mendId }`. `POST` on the same path starts the next sorry and returns `{ mendId }`
- `GET /posts/:id/comments` adds `helped` and `widelyAppreciated` to each comment while "This helped" is on
- `POST /posts/:id/comments` adds `resting: true` when the thread is now resting
- `GET` and `PATCH /admin/kind-norms`, for admins only

Tables: `kind_norms_settings`, `kindness_promises` and `comment_appreciations` (both in Download my data), `thread_heat`, and `resting_threads`. They are created in migration `20261029093000_kind_norms.sql`.
