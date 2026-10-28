# Notebook features (Batch 7)

Ideas from Steve's notebook and planning chats that weren't in the app yet. Each has its own switch under **Admin → Notebook features**. All are on by default except Witness stories. The full list of what is built, deferred or blocked is in `Prayer_Tower_Unbuilt_Ideas_Inventory.md` in the project files.

| Feature | Source | What members see | Switch |
| --- | --- | --- | --- |
| Answered notice | Notes p8 ("send thanks to God & to the pray-er"), Ethel 10–11 | When a request is marked answered without a testimony, everyone who prayed or committed gets "A prayer you prayed was answered" once. (With a testimony they get the testimony notice instead.) | Always on; members can mute it under Notification settings → Encouragement |
| Worldwide count | Project Management Document §2 ("847 people have prayed for you") | Feed: "🌍 1,284 prayers offered worldwide in the last day, by 312 people". Me: "N people have prayed for your requests." Real counts from the prayer log, never names. Hidden when the day's count is 0. | `worldwide_count_enabled` |
| Thanksgiving card | Notes p14 ("Add thanksgiving reminders to feed?") | A card at the top of the feed inviting a praise post, with the number of requests they prayed for that were answered. Hidden once they post a praise, or for N days after "Not now". | `thanks_card_enabled`, `thanks_card_days` (7) |
| Notes for event hosts | Notes p12 ("Eventually, sermon inputs?") | People who RSVP'd send the host what to pray about or preach on (500 characters, 5 per event). The host and staff see all of them with names; others see only their own. Crisis wording shows crisis support. | `sermon_inputs_enabled` |
| Witness stories of help | Business Plan 7 ("testimony engine… with permission, Witness team stories") | On a case marked helped, a Witness member writes the story without names and asks the person helped. It appears under **Stories of help** (linked from This week's highlights) only after they tap "Yes, share it", and they can take it back at any time. | `witness_stories_enabled` (**off** by default) |
| Full "Will you pray for" list | Idea Snippets mockup | Onboarding now offers Family, Friends, Loved ones, Neighbors of all kinds, My church, My community, My enemies, Towns, Cities, My nation, Other countries, The world. | none (answers only) |
| "Prayer and positive thoughts welcome" | Note of 2026-09-19 (secular-friendly interactions) | A composer switch; the card shows 🕊️ "Prayer and positive thoughts welcome". The existing Well Wishes button is the secular-friendly reaction. | `support_label_enabled` |

Pastor defaults (same batch): a verified church pastor skips the new-member limits, like staff, and their badge shows on events they host. See `CHURCH_PARTNERS.md`.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/features` | the four switches, for the app |
| GET | `/stats/worldwide` | `{ enabled, prayersToday, prayersAllTime, peopleToday, peoplePrayedForYou }` |
| GET | `/me/thanks-card` | `{ show, answeredYouPrayedFor }` |
| POST | `/me/thanks-card/dismiss` | hides it for `thanks_card_days` |
| GET / POST | `/events/:id/inputs` | list (host/staff: all) or send (RSVP first) |
| DELETE | `/events/:id/inputs/:inputId` | the sender, the host or staff |
| POST | `/witness/cases/:id/story` | Witness staff; case must be `helped` |
| DELETE | `/witness/stories/:id` | Witness staff withdraw a story |
| GET | `/me/witness-stories` | stories about me |
| POST | `/me/witness-stories/:id/decision` | `{ approve }`; a later `false` takes a shown story down |
| GET | `/help-stories` | approved stories, no names |
| GET / PATCH | `/admin/notebook-settings` | admins |

Event notes (`eventNotes`) and stories about you (`witnessStoriesAboutYou`) are in "Download my data" and are deleted with the account.
