# The kind cloud ("What would Ted Lasso do?")

Steve, 2026-10-29: "Rather than a popup block that Facebook includes you could have a cloud in the corner of the card that contains a prayer with a text message 'Are you sure you want to put that out there?'" **Off by default.** Admin → Notebook ideas → "Kind cloud".

## What members see

- A moment after a member stops typing a post, comment, encouragement or message, the app asks the server about the draft (`POST /moderation/precheck`).
- If the words look aimed at someone, a small cloud appears at the corner of the composer with a prayer ("Set a guard over my mouth, Lord; keep watch over the door of my lips." Psalm 141:3) and "Are you sure you want to put that out there?". Open Circle sees "Take a breath. Kind words travel far." instead of the prayer.
- A threat or a stream of swearing gets a firmer line: "Words like these can really hurt someone…".
- **Nothing is refused and there's no extra tap.** Steve: anything must be reviewed by a person before it is blocked, so no one describing their trauma is turned away. Holding a threat for a moderator belongs to the harm filter (`harm` in the same pre-check answer). When that answer carries `harm`, the cloud shows its gentle redirect and helplines.
- While the switch is on, the cloud replaces the older rules warning ("Post anyway").

## The rules (apps/server/src/modules/kindness)

Plain word rules on our own server: free, instant, and the same answer every time.

| Draft | Cloud |
|---|---|
| "This f\*\*\*ing cancer took my mom" (pain, aimed at no one) | none |
| "I f\*\*\*ing love you, sister" | none |
| "I want to kill myself" | none; crisis support as before |
| "You are an idiot", "screw you", "shut up" (aimed at "you") | gentle |
| Mostly capitals, 20+ letters | gentle |
| "I know where you live", "I'm going to hurt you", "kys" | firmer |
| 5+ strong swear words, or 3+ making up a fifth of the words | firmer |

The AI safety check (if set up) can also raise a gentle cloud. It still runs after posting, as before.

Why aimed-vs-not matters: toxicity models score celebrations with a swear word as toxic, while swearing with no target is toxic far less often (sources in the research doc).

## Research

The research summary with sources is `research/Kind_Interaction_UX_Research.md` in the project files. Short version: non-blocking nudges change 20–50% of flagged drafts (Twitter, Instagram, Nextdoor, OpenWeb/Jigsaw), with lasting effects.

## Tests

- `apps/server/test/kindness.test.ts`: the rules, the switch, nothing refused.
- `apps/mobile/src/__tests__/kind-cloud.test.tsx`: the cloud, the firmer line, the harm note, off means no check, and Open Circle wording.
