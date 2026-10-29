# Emoji meanings (emoji reactions that say something)

Steve, 2026-10-29: "Perhaps choosing an emoticon react ALSO adds a leaf with a positive word that emoticon represents, or opens to a tree of up to 5 sub-additions." **Off by default.** Admin → Notebook ideas → "Emoji meanings".

## What members see

- Under a post (on the post screen) there are six emoji: 🙏 ❤️ 🫂 💪 🎉 🕯️.
- **Tapping one** adds its first meaning as a leaf on the post, such as "💪 Feel better". Tapping someone else's leaf adds the same word, and tapping your own takes it back.
- **Pressing and holding one** opens up to five meanings (for 💪: Feel better, Praying for healing, Stay strong, You've got this, Strength for today). Each member can choose one meaning per emoji per post, and picking another replaces the first.
- Open Circle sees neutral wording ("Get well soon" in place of "Praying for healing").

## Why this shape

There's no existing hierarchical emoji language. The research, with sources, is in `research/Emoji_Reaction_Tree_Research.md` in the project files.

- Unicode CLDR keeps each emoji under 5 keywords.
- People misread emoji about 25% of the time; a chosen word says it outright.
- Facebook kept extra reactions behind a long-press so a quick tap stays fast.
- "Delicious" belongs to 😋, not ❤️, so it isn't in the first six.

## Staff

The tree is the `reaction_meanings` table (faith label, neutral label, position, enabled). Reword or retire a meaning there without an app release. Retire meanings nobody uses, as Facebook and LinkedIn did.

## The leaf look

The feed themes own the leaf. `Leaf` in `apps/mobile/src/components/meaning-reactions.tsx` takes optional `tokens` (`leaf`, `leafSoft`, `leafShape`). Without them it's a plain rounded chip.

## Data

- Members' choices are in `meaning_reactions`.
- They're included in the data export and deleted with the account.
- Tests: `apps/server/test/meaning-reactions.test.ts` and `apps/mobile/src/__tests__/meaning-reactions.test.tsx`.
