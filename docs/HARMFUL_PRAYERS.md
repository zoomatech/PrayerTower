# Harmful prayer requests

Some people will pray for harm: for someone to die, a curse on a neighbor, revenge on an ex, hate against a group, or a threat. Others will pour out abuse they have suffered, sometimes with a lot of swearing. This feature sorts that text and decides what happens to it. **It is off by default.** An admin turns it on in **Admin → Harmful prayers** (`PATCH /admin/harm-settings { "enabled": true }`).

## Steve's rules (2026-10-29)

- The machine filters out only the **truly obvious junk**. Anything that might be real goes to a **person** before anything is removed.
- **Nobody describing their trauma is blocked**, not even in a flood.
- **Swearing out of anguish is allowed.** Only excessive foul language and threats are stopped, and even those are held for a person rather than thrown away.
- Not everything goes to review, because a malicious flood could swamp the reviewers. Floods are bundled (see below).
- **Harmful prayers never reach the radio** or any amplifier until a moderator clears them.
- The check is free (word patterns, no AI service). The existing AI check (`MODERATION_PROVIDER`, LOCAL_MODERATION.md) still runs on top when a key or a local model is set, and feeds the same queue.

## Categories and what happens

| Category | Example | Default | What "default" means |
|---|---|---|---|
| Threat | "I'm going to kill him", "I know where you live" | **Hold** | Posted, but hidden from others until a moderator decides. Top of the queue (held items sort first). |
| Hate | "All immigrants should be wiped out", or an admin-added word | **Hold** | Same as threat. |
| Excessive swearing | 6 or more swear words (`foul_hold_at`) | **Hold** | A person reads it. Fewer swear words are left alone. |
| Pure junk | Nothing but swear words, no other words, no grief or prayer words | **Refused** | The only automatic refusal. Nothing is saved; the member is asked "Say a little about what happened, so people know how to pray for you." (`foul_junk_filter`) |
| Prayer for harm | "I pray he dies", "God, strike that man down" | **Review** | Stays up. Kept off radio, amplifiers, reach, pools and schedules. Goes to the queue. |
| Curse | "I curse my neighbor" | **Review** | Same. "Break the generational curse" is not a curse. |
| Revenge | "Help me get revenge on my sister" | **Review** | Same. "Vengeance is mine, says the Lord" is not revenge. |
| Abuse disclosure | "My husband hits me", "I was raped" | **Support** | Never hidden. The member gets the hotlines in the app and a private notice. A moderator is asked to check in kindly. |
| Self-harm | (unchanged) | Crisis support | The existing 988 crisis path (STAFF_HANDBOOK.md). |

Each category's action is an admin setting: `hold`, `review` or `allow` (abuse: `support` or `allow`). When a post has several categories, the most serious action wins, and anyone disclosing abuse still gets the hotlines.

**The check is tuned to leave ordinary prayers alone.** "Pray my mom doesn't die in surgery", "Pray for her as she is going to die soon", "I hope she dies peacefully", "Lord, don't let him die", "I'm going to beat this cancer", "Pray the tumor dies" and "Your prayers touched me" are all untouched (`apps/server/test/harm-check.test.ts` lists every case). A false alarm costs little: the post stays up and only waits for a moderator before going on air.

## What the member sees

Before posting, `POST /moderation/precheck` returns `harm: { category, action, title, message, resources[] }` (or `null`). The gentle "Are you sure?" cloud (thread "Research UI that encourages kind interaction") shows the message and any hotline links. The same object comes back from `POST /posts`, comments and messages. The words redirect, never lecture. For example, for a prayer for harm: "The Psalms are honest about enemies, and they leave vengeance to God. Try asking for justice, protection, and healing for what they did to you."

Abuse hotlines (US), from the CDC's [Get Help Right Now](https://www.cdc.gov/howrightnow/get-help) page: 911 if in danger; National Domestic Violence Hotline 1-800-799-7233 or text START to 88788 (also on [MNADV](https://www.mnadv.org/get-help/24-hour-national-hotline/)); RAINN 800-656-4673; Childhelp 1-800-422-4453.

## Floods

`flood_per_day` (default 5): after that many flagged items from one account in 24 hours, its further flagged items are held and **bundled into one queue item** ("Flood: …") instead of one item each. A moderator sees the flood in `GET /moderation/harm-floods` and decides it in one step: `POST /moderation/harm-floods/<userId> { "action": "release" | "remove" }`. Abuse disclosures are never held, even in a flood.

## Radio and amplification

A post with a `harm_category` waits in the radio queue (the station's claim skips it, the log transmitter waits) and can't be queued, amplified, pooled, scheduled or read on air by the Live Amplifier. When a moderator **dismisses** the flag, `harm_category` is cleared and it may go out. When they **remove** it, a queued radio prayer fails and its token is refunded, as before.

## For moderators

The queue shows the reason: "Possible threat: a person should read this", "Prayer for someone to be harmed", "Someone may be being abused: check in kindly", and so on. Dismiss when it is venting that is fine to stay; remove with the rule **Pray for good, never for harm** or **No harassment or abuse** when it is not. Every removal can be appealed, as usual.

## Where the practice comes from

- **X's violent speech policy** separates violent threats, wishes of harm and incitement, and allows hyperbole and figurative speech in context ([X: Violent speech](https://help.twitter.com/rules-and-policies/violent-speech)). That is why wishes of harm are reviewed by a person rather than refused.
- **IFTAS moderator guidance** treats every threat as high priority, asks whether a reasonable person would fear for their safety, and says to hide rather than delete so the evidence is kept ([IFTAS: Violent threat](https://about.iftas.org/library/violent-threat/)). Threats are therefore held, not deleted.
- **NNEDV Safety Net and CDT** ask platforms to answer traumatic disclosures with "empathy, respect, and effective options for recourse," and to protect the data ([Safety Net: traumatic disclosures](https://www.techsafety.org/blog/new-resource-traumatic-disclosures)). Hence support first and no hiding.
- **Swearing helps people cope.** Keele University found swearing raised pain tolerance by 33% ([Keele University, 2020](https://www.keele.ac.uk/about/news/2020/june/traditional-swearing/tolerate-pain.php)).
- **Imprecatory prayer:** the redirect follows the pastoral reading that the Psalms leave vengeance in God's hands and ask for justice ([Logos: Pray for enemies—and against them?](https://www.logos.com/grow/pray-for-enemies-and-against-them-lessons-from-the-psalms/)).

## Settings

| Setting | Default |
|---|---|
| `enabled` | off |
| `threat_action`, `hate_action` | hold |
| `harm_wish_action`, `curse_action`, `revenge_action` | review |
| `abuse_action` | support |
| `foul_hold_at` | 6 swear words |
| `foul_junk_filter` | on |
| `flood_per_day` | 5 |
| `extra_hate_words` | empty (admins add slurs or local terms) |

`GET /admin/harm-metrics?days=30` counts what was flagged, by category and action.

## Notes for the legal department

- A held threat is kept (hidden, not deleted) so it can be handed over if a credible threat is reported. Whether and when to contact the police is a staff decision (IFTAS guidance above).
- Abuse disclosures involving children may raise reporting duties for staff in some roles and states.
- The hotline list is US-only for now.

## Code

- `apps/server/src/modules/harm/` (the check, the actions, floods, routes)
- Migrations `20261029013000_harm_enum.sql`, `20261029013100_harmful_prayers.sql`
- Tests: `apps/server/test/harm-check.test.ts` (the patterns) and `apps/server/test/harm.test.ts` (end to end)
