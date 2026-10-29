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

Open Circle members (and any community with neutral wording) get the same redirects without religious words: no God, Psalms or Bible verses. For example: "It is fine to be honest about someone who hurt you. Try asking for fairness, safety, and healing for what they did to you." The hotlines are the same.

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

## Moderator care (off by default)

**Admin → Moderator care** (`PATCH /admin/moderator-care-settings`). Research on moderator wellbeing recommends optional "content soothing" such as blurring, break prompts triggered by exposure time or severity, and an easy way to get a second opinion so nobody decides a hard case alone ([Wellbeing-Centered UX: Supporting Content Moderators, 2025](https://arxiv.org/pdf/2509.07187); [Zevo Health: moderator wellbeing](https://www.zevohealth.com/blog/7-tips-for-managing-content-moderator-wellbeing/), which also recommends 2–5 minute micro-breaks).

- **Blur until tapped** (`blur_hard`, on): threats, hate, harm, crisis and auto-hidden items show "Hard to read … Tap to read it".
- **A break offer** after `break_after_minutes` (20) in the queue or `break_after_hard_items` (10) hard items read. The moderator chooses "Take a break" (`break_minutes`, 5; the queue steps aside with a countdown and can be ended early) or "Keep going". It is an offer, never a lock: crisis alerts still reach the other moderators.
- **Hand off** any item to a named moderator or to "anyone else", with a note. It leaves your queue and goes to the top of theirs (after crisis items); they get a notice without the content.

## Explaining a held post

When a post is held, its author gets a notice ("Your request is waiting for a moderator") with **Explain it**. Their explanation (once, up to 1,000 characters) is shown with the item, and items with an explanation sort ahead of other held items. Admins can turn this off (`explain_held`). The moderator's keep or remove decision then works as usual, and a removal can still be appealed. Floods don't get the notice.

## Moderation dashboard and weekly report (off by default)

Both switches are in **Admin → Moderator care**.

- **Dashboard** (`dashboard_enabled`, `GET /admin/moderation-dashboard?days=7`): what is waiting now and the oldest wait, by source; how fast items were decided (median and slowest tenth); the harmful-prayer false-alarm rate per category (flags a moderator kept, out of those decided); floods (how many, from how many accounts, items held) and handoffs.
- **Weekly report** (`weekly_report_enabled`, Monday 07:00 UTC, job `harm_weekly_report`): for each word rule (`harm_events.rules`, such as `curse:0` or `hate:admin_words`), how often it flagged last week and how moderators decided. A rule with at least 3 decisions that moderators kept half the time or more is marked **worth loosening**. Admins get a notice; reports are kept in `harm_weekly_reports`. It holds counts only, never member text. Floods are left out, because they say more about one account than about the words.

## Open Circle (secular edition)

The check, the holds, the review queue and the flood bundling work the same on Open Circle. The redirects members read use secular wording: "Ask for justice and safety", not "leave the rest to God", and no Scripture. Notices and error messages also pass through the usual neutral-wording filter. `apps/server/test/harm-open-circle.test.ts` checks that nothing an Open Circle member reads from it has a religious word.

## On-call rota (off by default)

**Admin → On-call rota** (`PATCH /admin/oncall`, shifts at `POST /admin/oncall/shifts`). Moderation guidance treats threats as high priority and asks for a person to look quickly ([IFTAS: Violent threat](https://about.iftas.org/library/violent-threat/)), so a held post should never sit unseen.

- **Shifts:** weekly, per moderator, in the rota's time zone (default America/New_York). The moderation screen shows who is on call now.
- **The limit** (`max_wait_minutes`, 60): a held, harmful-prayer or crisis item still waiting at `remind_at_percent` (50%) of the limit reminds whoever is on call (every moderator if nobody is). Past the limit, it goes to the person named in **When the wait passes, tell**, or to every admin. Each item is reminded and escalated once. The notices give counts and minutes, never the post's words. The check runs every 5 minutes (job `oncall_check`).
- **Notes for the next shift** sit at the top of the moderation screen (`POST /moderation/oncall/notes`).
- Code: `apps/server/src/modules/moderator-care/oncall.ts`, migration `20261029080200_oncall_rota.sql`, test `apps/server/test/oncall.test.ts`.

## Hotlines after posting

When someone posts or comments about abuse, their request opens with the hotlines above it ("You are not alone" and the numbers), as well as the private notice. Nothing is hidden or blocked. Self-harm keeps the existing crisis box with 988 (STAFF_HANDBOOK.md).

## One-tap restore (off by default)

**Admin → Moderator care → One-tap restore for held posts** (`restore_enabled`). Held items show **Restore** instead of Keep. One tap puts the post back up, logs a `restore` in `moderation_actions` (with the moderator) besides the decision in the staff audit log (Admin → Audit log), and tells the author "Your request is back up". Removed posts still come back only through an appeal.

## Regression

`apps/server/test/moderation-regression.test.ts` turns every moderation switch on at once (harmful prayers, moderator care, dashboard, weekly report, restore, on-call rota, the kind cloud) and runs the whole path in both editions: false alarms, a held threat through handoff, explanation, reminders, escalation and restore; abuse and crisis posts; junk and floods; the dashboard and rota. It found two bugs, both fixed: the threat redirect used religious words on Open Circle, and handing an item to a moderator failed on teams of more than 100.

## Disguised words (off by default)

**Admin → Harmful prayers → Read through disguised words** (`read_disguises`). People dodge word filters with number and symbol swaps (k1ll, d!e), split or stretched letters (k.i.l.l, k i l l, diiies), misspellings (kil, ded, revenj), coded words ("unalive", "six feet under", "sewer slide", "kms") and emoji (🔪 🔫 💀 ⚰️ 🔥). With the switch on, the check also reads the text with those disguises taken off (`apps/server/src/modules/harm/unmask.ts`) and runs the same patterns on it. The research on filter evasion ("algospeak") describes exactly these tricks ([Steen et al., 2023, "You can (not) say what you want"](https://dl.acm.org/doi/10.1145/3543873.3587355); [Washington Post, 2022: "Algospeak"](https://www.washingtonpost.com/technology/2022/04/08/algospeak-tiktok-le-dollar-bean/)).

- A disguised match is handled like a plain one: held or reviewed by a **person**. Nothing is ever refused because of a disguise.
- Coded self-harm ("unalive myself", "sewer slide", "kms") gets the usual crisis support and crisis check-in.
- The weekly report marks rules that matched only through a disguise with `:masked`.
- `apps/server/test/harm-adversarial.test.ts` lists every disguise caught, and ordinary prayers that must stay untouched ("Our worship night was 🔥", "7 years sober", "I dye my hair for chemo week", "u guys are the best").
