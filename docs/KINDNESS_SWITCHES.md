# Kindness switches: what each one does and where to turn it on

Every kindness tool is off by default. In the app, go to **Admin** and find the section named
below. To try the no-cost set in one go, use **Admin → Kindness starter set**, which turns on
every tool marked ★ in a single tap. A second tap turns them all off again. Each tool keeps its
own switch either way.

"Needs" lists anything beyond the app itself. Tools marked "none" cost nothing and work without
an AI key or volunteers.

## Before and while posting

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| ★ Kind cloud | Notebook features | A gentle "Are you sure?" cloud before a post or reply that may sting. It never blocks. | none (an AI key makes it smarter) |
| ★ Kindness tools intro | Growth practices | Three short cards on the feed explaining the kindness tools, shown once. | none |
| ★ Welcome card | Growth practices | A short card on how we talk here, shown above the comment box until the member comments or taps Got it. | none |
| ★ Who can reply | Conversation helpers | The asker chooses: everyone, only people who prayed, or no comments. | none |
| Reply suggestions, greeting packs, own words, kind closings | Conversation helpers | Starters and closings for kind replies. | none |
| Meaning reactions, one icon row | Notebook features, Conversation helpers | Meanings ride on the existing six action icons, never on a second row. | none |

## After someone shares

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| ★ How did it turn out? | Growth practices | One nudge, weeks later, to share how a request turned out. | none |
| ★ Check back | Growth practices | People who prayed can ask to hear back, with a quiet in-app note. | none |
| ★ Answered prayer stories | Growth practices | An answered request can become a story for those who prayed. | none |
| ★ Thank the pray-ers | Growth practices | One thank-you note per post, with "Glad to" replies. | none |
| ★ Hearts from the asker, thank a comment | Conversation helpers | The asker can heart or thank a comment. | none |
| ★ Quiet counts | Conversation helpers | Strangers see "people are praying" with no number. Only the asker sees the count. | none |

## When something goes wrong

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| ★ Ask kindly | Growth practices | The hurt person can send a polite private request to edit or remove a comment. | none |
| ★ Mend | Growth practices | A guided apology. Only the hurt person can start it, and a moderator reads it first. | a moderator |
| ★ A path back after a removal | Growth practices | The removal notice offers "Post again with changes". | none |
| ★ Cool-down | Growth practices | When two members trade three heated replies in a day, both get a pause card. Nothing is blocked. | none |
| ★ Calm threads | Growth practices | A moderator can slow a heated thread, which shows "resting for a moment". | a moderator |
| ★ Goldfish memory | Goldfish memory | The queue shows recent removals, which fade after 90 days. Serious harms never fade. | none |

## Personal growth (on Me)

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| ★ Gentle rhythm | Growth practices | Days this month instead of a streak, a welcome back, and fresh-start lines. | none |
| ★ Three good things | Growth practices | A private weekly gratitude card. | none |
| ★ Quiet milestones | Growth practices | Private markers on Me, such as a first prayer for someone and then 10, 25 and 50. There's no leaderboard. | none |
| ★ Kind words practice | Growth practices | A weekly made-up moment with three replies to try. No scores. | none |
| ★ Weekly intention | Growth practices | Pray 1 to 6 days a week, with rest built in. A short week is never mentioned. | none |
| Fresh starts on days that matter | Growth practices | Up to 3 of a member's own dates, plus Advent, Lent and Easter, invite a fresh start. | none |
| Answered & remembered | Growth practices | A look back at the member's own answered prayers. | none |

## People and circles

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| Prayer circles | Growth practices | Invite-only small groups of up to 12, each with a gentle feed. | members who start circles |
| Circle welcome | Growth practices | The circle's starter writes its welcome, and first-time posters see it. | circles on |
| Circle updates | Growth practices | "How it's going" or "answered" on a circle post. Three good things can be shared to a circle. | circles on |
| Encourager, check-in | Growth practices | A newcomer can ask for a welcoming volunteer, with a check-in after 2 weeks. | volunteers |
| Prayer partners | Growth practices | Two members see each other's requests, with no shared streak. | members who pair up |

## For admins

| Tool | Admin section | What it does | Needs |
| --- | --- | --- | --- |
| ★ Kindness weather report | Growth practices | The tone of each week from totals only: warm against heated, and people commenting. | none |
| ★ Community health report | Growth practices | Requests that felt held, requests answered, and members who came back. Never time spent. | none |

The starter set's list lives in `apps/server/src/modules/kindness-starter/index.ts` (`STARTER`).
The tests check that every switch in it exists and defaults to off, and that each one has a name
in the app.
