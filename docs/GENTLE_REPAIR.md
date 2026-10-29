# Gentle repair

Steve, 2026-10-29: "What would Ted Lasso do?". When words hurt, help people mend things
kindly, and set a warm tone before someone's first comment. Each part is **off** until
an admin turns it on in **Admin → Growth practices**. Nothing here blocks a post, and
nothing is blocked without a person reviewing it first. Research and sources:
`research/Conflict_Repair_and_Newcomer_Kindness.md` in the project files.

## Welcome card before a first comment
- A short, warm card above the comment box until the member's first comment, or until they tap **Got it**.
- Admins can write their own words (`welcome_text`). Left empty, the app's default is used.
- Evidence: Matias 2019 (r/science) found that posting the norms raised newcomer participation by about 70%. Nextdoor showing guidelines to new group members cut reports.

## "This hurt me" → ask kindly
- Under someone else's comment. The hurt person picks a reason (dismissive, grief, unkind, other) and sends the author **one polite, unsigned note** asking them to consider editing or removing the comment.
- It's sent once per comment per sender, never across a block, and never to yourself. **Report it instead** stays one tap away.
- Evidence: in Facebook's compassion research, about 75–80% sent the tailored note, about half of posters took the content down, and about half of senders felt positive afterwards.

## Mend: an invited sorry
- **Only the hurt person can start it** (forced apologies backfire). The author never learns who invited it.
- The author may write a sorry in three parts: **what I did**, **that it's on me**, and **what I'll do differently**. It doesn't ask for forgiveness, which is the least useful part (Lewicki 2016).
- **A moderator reads it first** (Moderation → Sorries to read). The moderator delivers it, or returns it **once** with a kind note, for example when it shifts blame ("if you were offended", "but you…"). A second return closes it.
- The hurt person can **accept** it (the author hears it was received) or **close it quietly** (the author hears only "closed"). They can withdraw at any time before it's delivered.
- **Nothing depends on it:** it never lifts a block, a hold or a penalty, and the writer gets no publicity.
- It's never offered across a block, or for a comment held for harm (a threat or abuse goes to moderators instead).
- One invitation per comment per hurt person, ever.
- Model: ApoloBot (Doan & Seering, CHI 2025), where the victim chooses, a moderator screens, and the victim has the final say.

## Code
- Server: `apps/server/src/modules/repair/`. Settings live in `practice_settings` (`modules/practices`).
- Mobile: `components/gentle-repair.tsx` (`WelcomeCard`, `HurtNote`, `MendQueue`) and `app/mend/[id].tsx`. Wired into `app/post/[id].tsx` and `app/moderation.tsx`.
- Migration: `supabase/migrations/20261029017200_gentle_repair.sql`.
- Tests: `apps/server/test/repair.test.ts`, `apps/mobile/src/__tests__/gentle-repair.test.tsx` and `mend-screen.test.tsx`.

*For the legal team:* Mend messages are user-to-user content; moderators read each one before delivery.
