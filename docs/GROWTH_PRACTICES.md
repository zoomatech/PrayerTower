# Growth practices ("What would Ted Lasso do?")

Steve, 2026-10-29: "a lot to strategically encourage personal growth." These are
kind habits with nothing to lose. Each is **off** until an admin turns it on in
**Admin → Growth practices** (`practice_settings`). Research and sources:
`research/Personal_Growth_Research.md` in the project files.

| Switch | What members see | Why |
|---|---|---|
| "Share how it's going?" follow-ups | Once, `followup_days` (default 21) after a request someone prayed for, its author gets one notice and a card on the request: **Grateful update**, **Still in it**, **Things changed**, or **Prefer not to say**. | Telling supporters how things turned out is the strongest thank-you (donor research; CaringBridge study, where prayer is the most-thanked support). |
| Weekly "Three good things" | A private card on Me for up to three good things a week, a reminder at 6 pm on the day the member picks, and **Share as a praise**. | Weekly gratitude helped where three times a week did not (Lyubomirsky); effects are small, so it's framed as a practice, never therapy. |
| Gentle rhythm instead of streaks | "Your prayer life" shows **days this month** (only adds) in place of days in a row, a welcome back after a week or more away ("be a goldfish"), and a fresh-start line on Mondays and the 1st. | Broken streaks lower motivation (Silverman & Barasch 2023); self-compassion after a setback raises effort (Breines & Chen 2012); fresh starts work (Dai, Milkman & Riis 2014). |

## Rules

- **Nothing counts what was missed.** No "you missed N days", no skipped-week notice, no answered-prayer scoreboard.
- **One follow-up per request, ever** (`request_followups` keeps it). Requests older than `followup_days + 30` days when the switch goes on are left alone.
- **A grateful update reuses the existing "answered" notice** (with the words as the testimony), so pray-ers hear the good news once, never twice.
- **"Still in it" or "Things changed" with words** posts a poster update and tells the pray-ers once (`followup_update`). Without words it just closes the card.
- **"Prefer not to say"** closes it quietly. Nothing is posted or sent.
- The gratitude card is private. Only **Share as a praise** makes it public, and only after the member edits and posts it in the composer.
- Open Circle gets neutral wording (`locales/neutral.ts`; server notices are neutralized automatically).

## Code

- Server: `apps/server/src/modules/practices/` (settings, follow-up, gratitude), the numbers in `prayer-stats/` (`monthDays`, `welcomeBack`, `freshStart`), jobs `practices_followup` (daily 17:00 UTC) and `practices_gratitude` (hourly) in `tasks.ts`.
- Mobile: `components/followup-card.tsx` (request screen, author only), `components/gratitude-card.tsx` (Me), the stats block on `app/(tabs)/profile.tsx`, Admin → Growth practices.
- Migration: `supabase/migrations/20261029017000_growth_practices.sql`.
- Tests: `apps/server/test/practices.test.ts`, `apps/mobile/src/__tests__/growth-practices.test.tsx`.

## Encourager and "Answered & remembered" (migration 20261029017100)

- **Encourager** (Me): a member volunteers after agreeing to the guidelines (up to 2 newcomers at a time). A member younger than `newcomer_days` (30) can ask for one. They're matched with the volunteer in the same community who has the most room, never across a block. A match lasts `encourager_days` (30) and ends on its own. Either side can end it with one tap: no reason asked, and the other person isn't told. There are no streaks and no "your encourager is waiting." Evidence: Wikipedia Teahouse retention, Stack Overflow mentoring, the helper benefit in AA sponsorship.
- **Answered & remembered** (Me → Look back, `app/remembered.tsx`): only the member's own answered requests that carry a grateful word (a testimony, or a grateful follow-up). Requests flagged sensitive or harmful, or whose words speak of a death or loss, never show. Any item can be hidden for good (`remembered_hidden`). It's never pushed. Evidence and warnings: Facebook "On This Day" harms, and Day One's per-journal opt-outs.

## Ted Lasso nudges (migration 20261029017500)

Each nudge has its own switch in **Admin → Growth practices**, and all are off by default.
- **Who did you lift up this week?** (`lift_up_enabled`, Me): a private weekly reflection, one short answer per week (`lift_up_entries`). It has no reminders and no counts, and earlier weeks are never shown as missed. Noticing your own kindness helps you repeat it (research/Personal_Growth_Research.md).
- **Weeks of gratitude** (`gratitude_count_enabled`): the gratitude card shows "Weeks you have counted good things: N". N counts every week the member ever filled in the card, so it only grows. It never resets and never mentions a missed week. This replaces the "gratitude streak" idea, because streaks that can be lost shame people.
- **Believe moment** (`believe_enabled`): Ted Lasso's taped-up BELIEVE sign.
  - Right after a member marks their prayer answered, the card invites them to share what happened (this opens the testimony box, unless they've already written one).
  - The people who prayed get the usual answered notice. It now carries `believe: '1'`, so opening it shows "A prayer you carried was answered. Your prayers mattered."
  - It fades in unless Reduce Motion is on, and screen readers read it as one message.
  - Open Circle gets neutral wording.
- Code: `practices/index.ts` (`liftUp`, `saveLiftUp`, `gratitudeWeeks`), `posts/routes.ts` (`answeredData`), `components/lift-up-card.tsx`, `components/believe-card.tsx`, and `app/post/[id].tsx`. Tests: `apps/server/test/believe-nudges.test.ts` and `apps/mobile/src/__tests__/believe-nudges.test.tsx`.

## Encouragement partners (migration 20261029017600)

- **Switch:** `partners_enabled` in Admin → Growth practices, off by default. `partner_days` (default 30, range 7–90) sets how long a pairing lasts.
- **Joining:** a member agrees to be kind, to keep what their partner shares private, and to report anything unsafe, then taps **Find me a partner** on Me. They're paired with whoever in their community has waited longest (`partner_pool`). Pairs never cross a block, and the same two people are never paired twice. If no one is waiting, the member waits on the list.
- **Check-ins:** each partner checks in at most once a day with "good", "okay" or "hard day" and an optional short note (`partner_checkins`), and the other partner gets a notice. A hard day adds "A kind word would mean a lot." Nothing counts check-ins or mentions a missed day.
- **Leaving:** either partner taps **Leave** at any time. No reason is asked, the other partner isn't notified, and they only see that it ended. A pairing also ends on its own after `partner_days`.
- **Account data:** data export includes the member's own check-ins. Account deletion removes them and ends any open pairing.
- **Code and tests:** code in `apps/server/src/modules/partners/` and `components/partner-card.tsx`. Tests in `apps/server/test/partners.test.ts` and `apps/mobile/src/__tests__/partners.test.tsx`.

## Kindness highlights (migration 20261029017700)

- **Switch:** `highlights_enabled` in Admin → Growth practices, off by default. This is a weekly set of real examples of members lifting each other up. Members see only the words: never who wrote them, and never whom they lifted up.
- **A person decides at every step:**
  1. On their own request, the member who was lifted up taps **This lifted me up** under someone else's comment.
  2. The comment's author gets a notice and answers **Yes, share them** or **No, thank you** on the Kindness highlights screen. Each comment is asked about once, so a no is final.
  3. Only consented comments reach Admin → Growth practices → Kindness highlights. There the admin picks a few for the week and can trim the words to remove any names.
  4. **Send this week's highlights** sends each member of that community one notice per week.
  5. The author can **Withdraw** at any time, and the highlight disappears at once.
- **Where members see them:** Me → Kindness highlights (`app/highlights.tsx`) shows this week and last week. Each community sees only its own highlights.
- **Account data:** data export includes the member's own nominated comments. Account deletion removes any nominations they wrote or made.
- **Code and tests:** code in `apps/server/src/modules/kindness-highlights/` and `components/kindness-highlights.tsx`. Tests in `apps/server/test/kindness-highlights.test.ts`, `apps/mobile/src/__tests__/kindness-highlights.test.tsx` and `highlights-screen.test.tsx`.

## Cool-down (off)

Admin → Growth practices → **Cool-down**. When two members trade three replies within a
day that the kind cloud's word rules would flag (an insult aimed at someone, a stream of
swearing, a threat), both see a pause card above the composer on the post or in the
one-to-one conversation, with one of four gentle lines in the spirit of "What would Ted
Lasso do?" ("Be curious, not judgmental", "Be a goldfish for a minute"). **Take a
breather** steps back from the screen; **I'm okay** puts the card away. Nothing is ever
blocked, held or hidden by this. Only who replied to whom and when is kept
(`heated_replies`), never the words, and the pair is offered at most once a day. Group
conversations don't count, since a heated line there isn't aimed at one person.
Code: `apps/server/src/modules/cool-down`, `components/cool-down-card.tsx`.

## Lament posts (off)

Admin → Growth practices → **Lament posts**. In the composer a member can turn on
**This is a lament**: grief or anguish to be heard, not fixed. (They can also turn it on
or off later, from their own post.) The post then:

- gets a small 🕯️ Lament tag on its card;
- gets no kind-cloud nudge for the author's own strong words (`context: 'lament'` on
  `/moderation/precheck`); threats still get the firmer cloud;
- shows repliers "Gentle words only, please, and no advice", and the cloud gently asks
  about advice and silver linings ("at least…", "have you tried…", "everything happens
  for a reason", "I know how you feel"). It's a nudge, never a block;
- stays off the radio (not queued, and the station and live amplifier skip it) unless
  the author turns on **Okay to send by radio**. Unmarking a lament takes back that yes.

Why no advice: bereaved people rate advice, "I know how you feel" and forced cheerfulness
as unhelpful, and simply being there as helpful (Lehman, Ellard & Wortman 1986, *Journal
of Consulting and Clinical Psychology* 54(4), listed at
https://www2.psych.ubc.ca/~dlehman/darrinpubs.htm; a 2023 condolence study found the
same, https://www.psypost.org/condolences-study-reveals-what-not-to-say-when-consoling-the-bereaved/).
Code: `posts.is_lament`, `posts.lament_radio`, `kindness.assessIn`, `components/lament-controls.tsx`.

## Answered-prayer stories (off)

Admin → Growth practices → **Answered-prayer stories** (migration 20261029018200). On
their own prayer request, the person who asked sees **Share how God answered** (Open
Circle: **Share how it turned out**). They write a short story (up to 2,000 characters,
with the kind cloud as usual) and it becomes a testimony post of its own:

- the request is marked answered if it wasn't already (the usual answered steps run:
  guest notes and the radio thank-you);
- the story card shows "Answers: “…”" with a short preview linking back to the request,
  and the request card shows **Read how it turned out**;
- everyone who prayed gets one note (deduplicated per request);
- each request can have one story, and it keeps the request's anonymous and sensitive
  settings.

Code: `posts.answers_post_id`, `POST /posts/:id/answered-story`, `app/post/[id].tsx`.

## Kindness tools intro (off)

Admin → Growth practices → **Kindness tools intro** (migration 20261029018300). At the top
of the feed, up to three short cards, one at a time, explain the kind cloud ("a gentle
cloud, never a wall"), emoji meanings (press and hold an action icon) and lament posts.
Only tools that are switched on get a card, and the wording follows the edition. Each
member sees it once on each device, until they tap **Got it** or **Skip**.

Code: `components/kindness-intro.tsx`.

## Check back (off)

Admin → Growth practices → **Check back** (migration 20261029018500). On their own open
request, the person who asked sees **Check back with me** and picks **In 3 days**,
**In a week** or **In 2 weeks**:

- When the day comes, they get one soft reminder ("Checking back, as you asked… No
  pressure at all"). A request answered by then gets none. They can pick **No reminder**
  at any time.
- When they post an update (**Post update**), everyone who prayed gets one quiet in-app
  heads-up ("Ana shared an update on a request you prayed for"). It never sends a push,
  carries none of the update's words, and comes at most once a day per request. An
  update also clears a pending reminder, since it did what the reminder was for.

This sits beside the 21-day follow-up: that one asks once on its own, while check back
is chosen by the person who asked. Code: `modules/check-back`, `components/check-back.tsx`,
the `check_back_due` cron (hourly at :30), and `quiet` on `notifications.notify`.

## Quiet milestones (off)

Admin → Growth practices → **Quiet milestones** (migration 20261029018600). On Me, a
member sees private markers for kindness toward others. Each line shows the highest
level reached, from the first time and then 10, 25, 50, 100, 250, 500 and 1,000:

- people prayed for (Open Circle: lifted up);
- requests prayed for;
- encouragements sent;
- prayer promises kept (check-ins);
- kind words left on others' posts.

A milestone reached since the last visit shows **New** once and is then marked seen.

Rules, following the gentle-rhythm practice:

- Only the member sees it. There is no admin view, no leaderboard and no comparison.
- Counts only grow, so nothing can be lost.
- Nothing about the member's own posts is counted, and answered prayers are never
  counted.
- Nothing is pushed. It is simply there on Me.

Code: `modules/kind-milestones`, `components/kind-milestones.tsx`, table
`kind_milestones_seen` (included in account deletion and export).

## Thank the pray-ers (off)

Admin → Growth practices → **Thank the pray-ers** (migration 20261029018800). On their own
post, once someone has prayed, the person who asked sees **Thank everyone who prayed**.
They write one warm note of up to 600 characters. Three starters help them begin ("Thank
you for carrying this with me…"), and the kind cloud checks it as usual.

- Everyone who prayed or promised to pray gets the note once. Each post can have only one
  note.
- Each pray-er sees it on the post as "A thank-you from Ana" and can answer **Glad to**.
- Only the person who asked sees how many said they were glad to. Strangers see nothing.
- This sits beside the older quick thanks (a 77-character line with an icon). It is the
  "gratitude letter" in research/Personal_Growth_Research.md, which found that writing
  thanks lifts the writer as well as the reader.

Code: `modules/thank-note`, `components/thank-note.tsx`. The tables `thank_notes` and
`thank_note_glad` are included in account deletion and export.

## Calm threads (off)

Admin → Growth practices → **Calm threads** (migration 20261029018900). This is
de-escalation for a whole comment thread, in the Ted Lasso spirit. It is the
thread-wide partner of cool-down, which works between two people.

- **Warm.** A thread turns warm when three comments the kind cloud would flag, from two
  or more people, arrive within two hours. Everyone on the post then sees "Let’s take a
  breath together… Be curious, not judgmental" above the comments. The note fades on its
  own after six quiet hours.
- **A person decides.** The thread appears under Moderation → **Warm threads**, showing
  only counts ("3 heated comments from 2 people") and the post's first words. A
  moderator reads the thread and chooses **It’s fine** or **Slow it down (6 hours)**.
- **Slow mode.** Only a moderator can turn it on. Each person may then comment once
  every 10 minutes, and anyone who tries sooner is told how long to wait. The app never
  limits anyone on its own, following Steve's rule that a person reviews anything before
  it is blocked.
- **Privacy.** Only who commented and when is kept (`heated_comments`), never the words.

Evidence: Facebook Groups' conflict alerts and comment slow-down, Hacker News's delay on
deep replies, and Cornell's "conversations gone awry" work
(research/Kind_Interaction_UX_Research.md, sections 2–3). Code: `modules/calm-threads`,
`components/calm-thread.tsx`.

## Prayer circles (off)

Admin → Growth practices → **Prayer circles** (migration 20261029019000). A member starts
an invite-only small group of up to 12 people. Each circle has its own gentle feed, with the
newest posts first. Members open it from Me → **Prayer circles**.

- **Invite only.** Only the person who started the circle can make an invite code. A code
  is 8 characters and works for 7 days, and a new code replaces the old one. Nobody can join
  a circle whose starter blocked them, or whose starter they blocked.
- **Stays inside.** Circle posts are kept in their own tables (`circle_posts`,
  `circle_replies`, `circle_prayed`). They never reach the main feed, the radio, search or
  digests.
- **Kindness tools come along.** The kind cloud checks every post and reply, and reply
  starters help members begin. Each post has one action, "I prayed". Other members get one
  quiet in-app heads-up per circle per day, with no push. Only the person who asked sees
  how many prayed.
- **A person decides.** The author or the circle's starter can take a post down, and the
  starter can remove a member. The app never removes anything on its own. If the starter
  leaves, the longest-standing member takes over, and a circle with no one left is deleted.
- **Data.** Circles, memberships, posts, replies and "I prayed" taps are included in
  Download my data. Account deletion removes them, and passes a circle the member started
  on to its longest-standing other member.

Code: `modules/prayer-circles`, `app/circles/`.

## Encourager check-in (off)

Admin → Growth practices → **Encourager check-in** (migration 20261029019100). It needs the
Encourager to be on. This is the mentor and newcomer pairing: the Encourager already pairs
a newcomer with a volunteer, and this adds a two-week check-in.

- After `encourager_checkin_days` (14 by default), each side gets one quiet "How is it
  going?" on their Encourager card, with three answers: **Going well**, **It’s okay** and
  **I’d like a change**.
- Answers are private. The other person is never told what was said.
- "I’d like a change" ends the pairing gently. The newcomer can ask again, even past their
  first days, and is never paired with the same person again. If the encourager asks for
  the change, the newcomer gets a kind note saying they can ask for someone new.
- Admins see only totals by answer.

Code: `modules/practices` (`checkIn`, `checkInDueTask`), `components/encourager-card.tsx`.

## Kindness weather report (off)

Admin → Growth practices → **Kindness weather report** (migration 20261029019200). Admins get
an anonymous, week-by-week view of how the community's conversations felt over the last 12
weeks.

- **Warm signals** are hearts from the asker, thank-yous, thank-you notes and "Glad to".
  **Heated signals** are replies the kind cloud flagged (calm threads and cool-down) and
  member reports.
- Each week gets a sky, judged by heated signals per comment:
  - **Sunny:** under 2% heated, and at least 10% warm.
  - **Fair:** under 5% heated.
  - **Cloudy:** under 12% heated.
  - **Stormy:** 12% or more.
- The report uses totals only and gives no score for any member. A week with fewer than 5
  comments shows "Too quiet to say" and no numbers.
- Each week also counts **how many different people commented**. This answers the question in
  Steve's notes (p. 2), "Will stopping arguments on the forum reduce or encourage engagement?":
  compare the people count in calm weeks with stormy ones.

Code: `modules/kindness-weather`, the Admin → Growth practices panel.

## Circle welcome (off)

Admin → Growth practices → **Circle welcome** (migration 20261029019300). It needs prayer
circles to be on.

- The person who started a circle writes a short welcome, up to 400 characters, which sets
  out the circle's norms. If they leave it empty, the app's default words are used: "Here we
  lift each other up. Disagree gently, assume the best, and if something stings, be a
  goldfish."
- Someone who hasn't yet posted or replied in the circle sees the welcome above the composer
  until they tap **Got it**.
- When someone shares in the circle for the first time, the starter gets one quiet heads-up:
  "… shared in your circle for the first time. A hello goes a long way."

Evidence: research/Conflict_Repair_and_Newcomer_Kindness.md, suggestion 1. Code:
`modules/prayer-circles` (`setWelcome`, `welcomeSeen`), `app/circles/[id].tsx`.

## A path back after a removal (off)

Admin → Growth practices → **A path back after a removal** (migration 20261029019400).

- When a moderator removes a post or comment, the removal notice adds one line: "You’re
  welcome to post it again with changes".
- The notice offers **Post again with changes**. For a post, the button opens the author's
  own words in the composer. For a comment, it opens them in the comment box on that request.
- Only the author can read their removed words this way (`GET /me/removed/:itemId`).
- It is never offered for prayers for harm, for flooding or for automated accounts.

Evidence: research/Conflict_Repair_and_Newcomer_Kindness.md, suggestion 5. Code:
`modules/path-back`, the Notices tab.

## Kind words practice (off)

Admin → Growth practices → **Kind words practice** (migration 20261029019600). A private card on
Me shows one short, made-up moment each week (a new one every Monday, six in turn), with three
possible replies. Tapping a reply shows gently how it might land: why "at least" can shrink a
feeling, why naming the hurt helps, why a quick fix can wait.

- There are no scores, points, streaks or right answers, and nothing a member taps is saved or
  sent.
- The moments use plain words that suit both faith and Open Circle wording.

Source: Steve's notes, p. 4 ("promote empathy, with content, interaction, games & personal
stories"). Code: `components/kind-words-card.tsx`.

## Weekly intention (off)

Admin → Growth practices → **Weekly intention** (migration 20261029190100). In "Your prayer
life" on Me, a member may choose how many days a week they would like to pray: 1 to 6, so at
least one rest day is always built in. "No aim" is the default.

- A row of dots for Monday to Sunday fills in for each day they showed up. Dots never empty.
- Once the aim is met, a kind line says "You did what you meant to this week. Rest well."
- A week that falls short is never mentioned, and each Monday starts fresh. There is no streak.

Evidence: research/Personal_Growth_Research.md §4 ("If someone sets a personal goal, it is
weekly and includes rest days"). Code: `modules/prayer-stats` (`intentionFor`),
`PUT /me/weekly-intention`, `components/weekly-intention.tsx`.

## Community health report (off)

Admin → Growth practices → **Community health report** (migration 20261029190100). Admins see,
week by week, what matters rather than time spent in the app:

- **Requests**, and how many **felt held**, meaning someone else prayed or replied within two days.
- **Answered**: requests marked answered that week.
- **Came back**: members active that week who were also active in the four weeks before.

The report uses totals only, with no per-member numbers. A week with fewer than 5 requests shows
"Too quiet to say".

Evidence: research/Kind_Interaction_UX_Research.md §5 ("measure 'requests that felt held,'
'prayers answered' and returning members, never time spent"). Code: `modules/kindness-weather`
(`health`), `GET /admin/community-health`.

## Fresh starts on days that matter (off)

Admin → Growth practices → **Fresh starts on days that matter** (migration 20261029190200).
Gentle rhythm already invites a fresh start on Mondays and the 1st. With this switch on:

- In **Days that matter** on Me, a member may save up to three dates of their own, such as a
  birthday, a baptism or the day they began again. Only they see them, and the dates are included
  in their data download.
- On that day, "Your prayer life" says "Today is … A fresh start: want to pick one small
  intention?".
- In communities with faith wording, the first Sunday of Advent, Ash Wednesday and Easter Sunday
  also invite a fresh start. Open Circle never sees the seasons.
- Nothing is pushed, and nothing is said on any other day.

Evidence: the fresh-start effect, where temporal landmarks raise goal starts (Dai, Milkman &
Riis 2014), in research/Personal_Growth_Research.md §4 ("fresh-start invitations … on the
person's chosen milestones, such as a birthday or a church season"). Code: `modules/fresh-days`,
`components/fresh-days.tsx`.
