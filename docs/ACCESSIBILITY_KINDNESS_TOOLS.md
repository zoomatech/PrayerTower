# Accessibility: kind cloud, emoji meanings, conversation helpers

This was a review pass on 2026-10-29 covering screen readers, reduced motion and larger text. The pilot runs on iPhone, so VoiceOver comes first.

| Area | Found | Fixed |
| --- | --- | --- |
| Kind cloud | iOS has no live regions, so VoiceOver never read the cloud when it appeared. The two decorative "puffs" were reachable by the screen reader. Its fixed 260-point width cramped larger text. | It now calls `AccessibilityInfo.announceForAccessibility` once when the cloud appears or changes (label, any harm note, then the question). The puffs are hidden from screen readers. The width is now up to 85% of the row, with a 200-point minimum. |
| Emoji meanings | Word leaves were 36 points tall, below Apple's 44-point minimum. Opening the meaning tree from the VoiceOver action gave no feedback. The emoji in the tray could grow without limit with the largest text sizes. | Leaves are now 44 points tall. Opening the tree announces "Choose what 💪 means". Each meaning button has a full label (emoji and word). Tray emoji grow up to 2× (`maxFontSizeMultiplier`). |
| Conversation helpers | Suggestions used the checkbox chip, so VoiceOver read them as "checkbox, not checked", and there was no word on what a tap does. | Suggestions are now buttons, 44 points tall, with the hint "Puts these words in your message box. You can edit them before sending." Picking one announces that it was added (and the "make them yours" hint, when it's on). |
| Motion | None of the three animates. | Nothing to change. The new Believe card fades in only when Reduce Motion is off (`lib/motion.ts`). |

The helper is `announce()` in `apps/mobile/src/lib/motion.ts`. Tests are in `kind-cloud.test.tsx` and `conversation-helpers.test.tsx` (announcement, button role and hint) and in `believe-nudges.test.tsx` (the card is read as one message).

Still to check by hand on a device (VoiceOver and the largest Dynamic Type size): the comment composer with the kind cloud and suggestions both showing, and the meaning tree on the vine and tower skins.

## Pass of 2026-10-29: screen readers, large text, Open Circle wording

Covers everything shipped from this thread: kind cloud, cool-down, lament, emoji
meanings on the action icons, member-made meanings, kindness research page, answered
stories, the kindness intro, reply prompts by kind of post, check back and quiet
milestones.

- **Screen readers.** `__tests__/kindness-a11y.test.tsx` renders the tools in both
  editions with their switches on. It checks that every button and link has a spoken
  name, and that cards have headings. Fixes from this pass:
  - The check-back title is now a heading.
  - The mend queue's comment line is now a link.
  - A new quiet milestone reads "New: …" in a single announcement.
- **Large text.** None of these tools turns off font scaling. Rows wrap rather than
  clip. Every target is at least 44 pt tall, including the story links and the reply
  chips.
- **Reflow and text spacing.** The e2e test `23-kindness-reflow` walks the feed, Me, a
  request, your own request, the research page, meaning words and highlights at 320 CSS
  px. It does this once as normal and once with WCAG 1.4.12 text spacing, with every
  switch on. It checks for sideways scrolling and runs axe WCAG 2.2 AA.
- **Open Circle wording.** `open-circle-wording.test.ts` now also covers
  `answeredStory`, `kindIntro`, `checkBack` and `kindMilestones`, as well as the new
  `talk.pairs`.

## Later on 2026-10-29: comment kindness, thank-you notes, calm threads

- **Comment kindness.**
  - **♡ Love this** is a button that reports its selected state. **Thank** is a button
    with a hint saying the thanks is private.
  - Both announce what happened ("Loved. They’ll get a quiet note.", "Thank-you sent.
    Only they will see it.").
  - Both are at least 44 pt tall.
  - Quiet counts swap the number for words, so a screen reader hears "People are praying
    with you" rather than a number that was hidden on screen only.
- **Thank the pray-ers.** The card has a heading. The starters are buttons, 44 pt tall,
  that only fill the box, and the kind cloud runs on the note. Sending announces how many
  people it went to.
- **Calm threads.** The note is a summary with a heading, so screen readers reach it
  before the comments. The moderators' queue gives each thread as a link, with counts
  and two labelled buttons.
- **Tests.** `comment-kindness.test.tsx`, `thank-note.test.tsx` and
  `calm-thread.test.tsx` cover each feature in both editions. The e2e reflow walk
  (`23-kindness-reflow`) visits the post screen, where all three live, with every switch
  on.
