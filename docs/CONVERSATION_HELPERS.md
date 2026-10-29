# Conversation helpers

Steve, 2026-10-29: build the six greeting ideas from the research in the project files,
`research/Greeting_Sequences_and_Conversational_Chains.md` (20th and 21st century studies,
many languages). Each helper is **off** until an admin turns it on in
**Admin → Conversation helpers**. After that, each member still chooses for themselves on
**Me → Conversation helpers**. A tap only fills the reply box. The member always edits and
sends it themselves, and nothing is sent automatically.

Where it shows: under the message box in a conversation, and under the comment box on a post.
All of the guessing happens on the phone (`apps/mobile/src/lib/talk.ts`), so no message
text is sent anywhere for it.

| Switch | What the member sees | Research basis |
| --- | --- | --- |
| `reply_suggestions_enabled` | **One** reply that fits the last message: a greeting back, "You're so welcome" for thanks, "Praying for you right now" for a trouble, "That's wonderful news!" for good news, and a goodbye for a goodbye. In an empty conversation it offers a greeting. | Adjacency pairs (Schegloff & Sacks 1973), Switchboard DAMSL tags, and Smart Reply (Kannan et al. 2016). |
| `meaning_prefs_enabled` | **My meaning words** (needs emoji meanings on): for each emoji, choose which word comes first and hide the words you'd rather not use. Only your own tray changes, and at least one word always stays. | A related-word cluster (Morris & Hirst 1991), not a sequence; emoji fall into a few communities of meaning (Fede et al. 2017). |
| `trouble_nudge_enabled` | After a short, downbeat answer ("Oh, okay I guess", "been better"), a gentle question: "Want me to pray about anything?" (Open Circle: "Want to talk about it?"). | Troubles talk (Jefferson) and "oh"-prefaced answers (Heritage 1998). |
| `greeting_packs_enabled` | The member picks one tradition, and an opening greeting from it is offered in an empty conversation, with a one-line note on what it means. Packs: Chinese, Korean, Arabic, Yoruba, Hebrew, Hawaiian. | Greetings differ by culture (Duranti 1997; Firth 1972). English only for members, so there is no Spanish pack. |
| `own_words_enabled` | After a suggestion is used, and while the text is unchanged, a light line: "Suggested words are a start. Make them yours?" | Suggested replies flatten writing and lose trust when they look automatic (Hohenstein & Jung 2020; Arnold et al. 2020). |
| `kind_closings_enabled` | Two warm ways to close once a conversation is under way. | Pre-closings and closings (Schegloff & Sacks 1973). |

## Where it lives
- Migration `supabase/migrations/20261029017300_conversation_helpers.sql`: `conversation_settings` (six switches), `conversation_prefs` (each member's choices) and `meaning_prefs`.
- Server `apps/server/src/modules/conversation-helpers/`. Routes: `GET/PATCH /me/conversation-prefs`, `GET/PUT /me/meaning-words`, and `GET/PATCH /admin/conversation-settings`. `/reaction-meanings` returns each member's own order and hidden words.
- App: `components/reply-helpers.tsx`, `components/conversation-prefs-card.tsx`, `app/meaning-words.tsx`, and the admin section in `app/admin.tsx`.
- The data export and account deletion include `conversation_prefs` and `meaning_prefs`.
- Tests: `apps/server/test/conversation-helpers.test.ts` and `apps/mobile/src/__tests__/conversation-helpers.test.tsx`.

## Counting patterns (`talk_counts_enabled`)
The greeting research found **no published counts** of greeting → reply → follow-up chains, and no study of emoji used as a *reply* (only of emoji appearing together in one message). Prayer Tower can fill that gap with its own anonymous, opt-in data.
- **Off** until an admin turns it on. Even then, only members who turn on **Me → Conversation helpers → Help us learn how kind talk flows** are counted.
- The phone works out the kind of each move (see `lib/talk.ts`) and sends **labels only**: for example `greeting → greeting → how are you`, or `🙏 "praying" in reply to a trouble`. It never sends words, names, or which conversation or post.
- The server keeps **weekly totals** (`talk_chain_counts`, `emoji_reply_counts`). They have no member column. A separate daily cap (`talk_count_quota`, 200 a day, kept for two days) stops anyone from skewing the totals.
- **Admin → Conversation helpers** shows the last 12 weeks. Any pattern with fewer than 5 counts is folded into "Other patterns", so a small pilot can't single anyone out.
- Note for the legal team: these are aggregate, de-identified counts collected with opt-in. The privacy policy may want a line about them.

## Meanings in the icon row (off)

Admin → Conversation helpers → **Meanings in the icon row**. Needs **Emoji meanings** on too.
The emoji join the single icon row on every post card, so every feed skin (vine, tower,
neon, wall, and the rest) gets them without its own code: all skins draw cards with
`PostCard`. A tap adds the emoji's first meaning. Press and hold (or the screen reader's
"choose" action) opens up to five meanings in a sheet at the bottom of the screen, so no
skin clips it. Hovering with an iPad pointer or a Mac shows the words above the icon.
Each icon is 44 points, has a spoken label, and reading the chosen meaning is announced.
The meaning list is fetched once per session, not once per card.
