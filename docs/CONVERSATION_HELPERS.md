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
Every card keeps its one row of action icons in every feed skin (Steve, 2026-10-29: one
row, meanings on hover or long press). No icons are added. The actions that match an
emoji carry its meanings: Praying Now 🙏, Well Wishes ❤️, Encourage 🫂 and Commit 💪
(`ACTION_EMOJI` in `components/meaning-chooser.tsx`). Hovering with an iPad pointer or a
Mac shows the action's name with the emoji's meanings. Pressing and holding (or the
screen reader's "choose" action) opens up to five meanings in a sheet at the bottom of
the screen, so no skin clips it. A plain tap still does the action. Every target stays
44 points. On the request's own page the full meaning tree with its leaves sits below
instead. The meaning list is fetched once per session, not once per card.

## Kindness research page (off)

Admin → Conversation helpers → **Kindness research page**. Members then find
**Me → How we talk here**: the same anonymous Counting patterns totals the admin sees,
drawn as two simple bar charts (greeting → reply → follow-up chains, and emoji used as a
reply, with the meaning words). One colour, ranked, each bar labelled with its number,
at most eight bars a chart. Anything seen fewer than five times stays folded into
"other", exactly as in the admin view. Route: `GET /kindness-research` (404 while off).

## Members suggest meanings (off)

Admin → Conversation helpers → **Members suggest meanings** (needs Emoji meanings on).
On Me, **Suggest an emoji meaning** lets a member pick one of the emoji and write a few
kind words (2 to 40 letters). Words the kind cloud would flag, words the emoji already
has, and a sixth waiting suggestion are refused. Each suggestion waits under the switch
in Admin, showing the emoji's meanings now but never who suggested it. The admin can
reword it (faith and Open Circle wording) and **Add it** or **Decline**. An emoji holds
five meanings at most: when it's full, the admin picks one to retire. A retired meaning
keeps its row, so leaves already on posts still show. The member sees each suggestion as
waiting, added or not added. Routes: `GET/POST /me/meaning-proposals`,
`GET /admin/meaning-proposals`, `POST /admin/meaning-proposals/:id`.

## Reply prompts by kind of post (off)

Admin → Conversation helpers → **Reply prompts by kind of post** (migration
20261029018400). A post opens a pair, and the reply is its second half (Schegloff 1968),
so when a member who turned on reply suggestions answers a post itself (not a comment),
the one suggestion is the reply that pairs with the post's kind:

| Kind | Faith | Open Circle |
| --- | --- | --- |
| Prayer request | Praying for you right now. You are not alone in this. | Thinking of you right now. You are not alone in this. |
| Praise | Praise God! Thank you for telling us. | That’s wonderful! Thank you for telling us. |
| Open prayer | Amen. Joining you in this prayer. | Joining you in this. |
| Testimony | Thank you for sharing how it turned out. This encourages me. | same |
| Confessional | Thank you for trusting us with this. You are not alone. | same |
| Discussion | Thanks for raising this. What I keep thinking about is… | same |
| News | Thanks for passing this on. | same |
| Blog | Thank you for writing this. What stayed with me was… | same |
| Lament | I’m here with you. (presence, no advice) | same |

Still one suggestion per move, as Smart Reply does: the pair replaces the guess from
the post's words. A tap only fills the box, and own-words still applies.

Code: `pairKey` in `lib/talk.ts`, `postType`/`lament` props on `ReplyHelpers`.

## Comment kindness and quiet counts (off)

Three ideas mined from `research/Kind_Interaction_UX_Research.md` (sections 4 and 6), each
behind its own switch in Admin → Conversation helpers (migration 20261029018700). None
shows a public number.

- **The asker's heart.** The person who asked can tap **♡ Love this** under a comment on
  their post. Everyone then sees "❤️ Loved by the person who asked", and the commenter
  gets one quiet in-app note. YouTube found that a creator's heart in the first hour was
  linked to about 22% more comments (arXiv 2404.03612).
- **Thank someone for a comment.** Any member can tap **Thank** under someone else's
  comment, once. Only the commenter hears ("Ana thanked you for your comment"), and
  nothing is counted in public. Wikipedia's Thanks experiment raised thanks sent by 43%
  and retention by about 2 points.
- **Quiet counts.** On Me, a member can hide prayer numbers on posts they see, on their
  own posts for others, or both. Instagram has made hiding like counts each person's own
  choice since 2021. In place of the number, people see "People are praying with you"
  (Open Circle: "People are with you"). Authors always see their own numbers.

Code: `modules/comment-kindness`, `components/comment-kindness.tsx`. The tables
`comment_hearts`, `comment_thanks` and `quiet_count_prefs` are included in account
deletion and export.

## Who can reply (off)

Admin → Conversation helpers → **Who can reply** (migration 20261029019500).

- The person who asked chooses, on their own request, who may comment:
  - **Everyone**, which is the default.
  - **People who prayed**: those who prayed, promised to pray or reacted.
  - **No comments, just prayers.**
- The author can change it at any time and can always post updates.
- Anyone who can't comment sees a gentle note instead of the comment box: "Your prayer still
  means a lot."
- It is the author's own choice, like the reply controls on X and Threads, and never a
  penalty. While the switch is off, everyone can comment as before.

Code: `modules/reply-choice`, `components/reply-choice.tsx`.

## Comments at block breaks (off)

Admin → Conversation helpers → **Comments at block breaks** (migration 20261029110100).
From notebook Page 13: "a thread can incur comments at any 200-word block break."

- On a request's own page, a post longer than 200 words is shown in parts of about 200
  words. Each part ends at a paragraph break, or else a sentence end, within the last
  quarter before the mark (`postParts` in packages/shared).
- After each part: **Comment on this part**, and how many comments that part already has.
- The comment box then says "Commenting on part 2 of 3", with a link to comment on the
  whole post instead.
- The comments stay together at the end, as Steve leans toward, each marked "On part 2".
- Only a new top-level comment can be about one part. Replies and updates belong to the
  whole thread.
- While the switch is off, the post shows whole and a part sent by an older app is ignored.

Code: `posts.addComment` (part check), `components/post-parts.tsx`. Tests:
`test/part-comments.test.ts`, `post-parts.test.tsx`, e2e `25-part-comments.spec.ts`.

## Everything shipped on 2026-10-29 (all off by default)

| Feature | Where to switch it on | Doc |
| --- | --- | --- |
| Meanings ride on the action icons (one row, hover / press and hold) | Conversation helpers → Meanings in the icon row | this file |
| Member-made emoji meanings | Conversation helpers | this file |
| Kindness research page | Conversation helpers | this file |
| Reply prompts by kind of post | Conversation helpers | this file |
| The asker's heart, Thank for a comment, Quiet counts | Conversation helpers | this file |
| Cool-down, lament posts, answered-prayer stories, kindness intro | Growth practices | GROWTH_PRACTICES.md |
| Check back, quiet milestones, thank the pray-ers, calm threads | Growth practices | GROWTH_PRACTICES.md |
| Prayer circles, encourager check-in, kindness weather report | Growth practices | GROWTH_PRACTICES.md |
| Circle welcome, a path back after a removal | Growth practices | GROWTH_PRACTICES.md |
| Who can reply | Conversation helpers | this file |

Every one of them has Open Circle wording, and `open-circle-wording.test.ts` checks it.
For accessibility, see `ACCESSIBILITY_KINDNESS_TOOLS.md`. The e2e walk `24-kindness-skins` opens the feed
and a request on all 13 year-round skins with every switch on. It checks that each card keeps one row of
at most six icons, that nothing scrolls sideways, and that axe finds no WCAG A/AA issue.
