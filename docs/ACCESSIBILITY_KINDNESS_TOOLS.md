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
