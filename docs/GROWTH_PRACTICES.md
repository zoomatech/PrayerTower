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
