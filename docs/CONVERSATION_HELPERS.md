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
