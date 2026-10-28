# AI features: "Imagine a conversation with God" and the circle facilitator

Both are **off by default**. Turn them on in **Admin → AI features**.

Nothing is sent to an AI until both of these are true:
1. An admin turns the feature on.
2. The server has `ANTHROPIC_API_KEY`.

Without the key, members get fixed answers. The facilitator still shows its questions one at a time, with no AI replies. The admin section says whether an AI is connected.

## 1. Imagine a conversation with God

Steve's brief: "simulate a conversation with God... with a very strong warning that it is not God and just an imagining to role-play what it might be like to have a 'relationship' with God."

| Part | Behavior |
|---|---|
| Warning | Pinned at the top of the screen on every visit. Every AI reply is labeled **AI (not God)**. Admins can edit the wording, which defaults to "This is an AI. It is not God, and it does not speak for God…". |
| Voice | A gentle, imagined voice shaped by how the Bible describes God. It may cite Scripture by book, chapter and verse. |
| Never | It never claims to be God, and never announces God's will, prophecy, signs, forgiveness of sins, healing or promises. It gives no decisions on health, money, law or relationships. |
| Points to people | It points the member to their own prayer, a pastor, a prayer partner and their church. |
| Crisis | If the member mentions suicide or self-harm, the screen shows the crisis line, and the AI steps out of the role-play and urges them to call. |
| Who sees it | It is hidden from Open Circle (secular) members. |
| Limit | 20 messages per member a day by default; admins can change it. |

The full instructions the AI gets are `GOD_SYSTEM` in `apps/server/src/modules/ai/index.ts`.

## 2. The circle facilitator

Notebook Page 4: move disputes to a video circle "so there is no hiding behind posts". The facilitator is the first step before that circle.

1. On Me, the member taps **Prepare for a restorative circle** and picks one: "I was hurt", "I may have hurt someone" or "I am not sure".
2. The AI asks the IIRP restorative questions one at a time, and reflects back each answer without judging. The questions come from the [IIRP Restorative Questions card](https://IIRP.edu/images/2024/K12_Resources/IIRP_Restorative_Questions.pdf); also see [Using the restorative questions](https://www.iirp.edu/news/using-the-restorative-questions-with-youth-a-guide-from-iirp-faculty-and-staff).
   - **For someone hurt:** What did you think when you realized what had happened? What impact has this incident had on you and others? What has been the hardest thing for you? What do you think needs to happen to make things right?
   - **For someone who may have hurt someone:** What happened? What were you thinking of at the time? What have you thought about since? Who has been affected by what you have done, and how were they affected? What do you think you need to do to make things right?
3. At the end, the AI writes a short summary. The member can edit it and tap **Ask for a circle**.
4. Moderators, admins and pastor-counselors see the request at the top of the **Moderation** screen. They schedule the circle in Events, then tap **Done**.

The facilitator uses neutral wording, so it works for Open Circle members too. It never takes sides, never gives legal or therapy advice, and never suggests meeting the other person if the member describes abuse, violence or danger. Default limit: 30 messages per member a day. A member can have one open request at a time.

Ted Wachtel (IIRP founder) is named in the notebook. Contacting him or IIRP is Steve's.

## What is stored

| Data | Kept? |
|---|---|
| The conversation | No. The app sends the recent turns with each message, and the server doesn't save them. |
| A count of messages per member per day | Yes, for the daily limit (`ai_usage`). It is deleted with the account. |
| A circle request (role and the member's summary) | Yes, only when the member sends it. It is in the member's data export and deleted with the account. |

## For other departments (legal, privacy, pastoral)

These are notes, not blockers:
- **Privacy:** when the feature is on, what a member writes is sent to Anthropic to get a reply. The Privacy Policy should name Anthropic as a processor for this feature. Anthropic's API data retention applies.
- **Pastoral:** a pastor should review the not-God instructions (`GOD_SYSTEM`) and the warning text before launch.
- **Restorative practice:** a trained facilitator should review the facilitator instructions (`facilitatorSystem`).

## Settings and code

| Part | Location |
|---|---|
| Database | `supabase/migrations/20261029004000_ai_companions.sql`: `ai_settings`, `ai_usage`, `circle_requests`. The chat switch and warning stay in `future_settings`. |
| Server | `apps/server/src/modules/ai/` (`provider.ts` calls Claude; `index.ts` holds the rules and limits) |
| Model | `AI_CHAT_MODEL` (default `claude-opus-5-5`), at low effort. If Claude's safeguards decline, the API retries on its fallback model. |
| App | `app/ai-chat.tsx`, `app/circle-prep.tsx`, `components/circle-requests.tsx`, and Admin → AI features |
| Tests | `apps/server/test/ai.test.ts`, `ai-provider.test.ts`, `apps/mobile/src/__tests__/ai.test.tsx` |
