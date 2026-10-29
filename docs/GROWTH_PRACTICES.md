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

## Next in line (not built)

- Opt-in **Encourager** for newcomers' first 30 days (Wikipedia Teahouse, AA sponsorship), with no "your partner is waiting" messages.
- **Answered & remembered** look-back of grateful updates only, never raw requests, with no push by default.
