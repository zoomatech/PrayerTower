# Growth ideas the big platforms missed

Steve asked on 2026-10-28 for "a way to boost usage that the other Social Media companies missed." The research and ranking are in the project files at `roadmap/Growth_Ideas_Big_Platforms_Missed.md`. This doc covers the four ideas that are built. Each one is **off** until an admin turns it on under **Admin → Growth ideas**. All four work in both editions, and Open Circle members see Open Circle's wording.

## What each one does

| # | Feature | What members and guests see | Switch |
|---|---|---|---|
| 1 | Pray from a link, no account needed | On their own open request, the asker taps **Let friends without the app pray**. The share sheet sends a web link. Anyone who opens it reads the request and taps **I prayed**, with no account. A guest may leave a first name, and can tick a box to hear once by email if the prayer is answered. The asker gets "Ana prayed for you" (one notice per request per day) and sees "3 people prayed from your link". | `guest_prayer_enabled` |
| 2 | Email prayer chain | Under Me → **My prayer chain**, the member adds the people already on their email prayer chain. Each address gets one email asking to join. On an open request, **Send to my prayer chain** emails the request, with the link from feature 1, to everyone who said yes. Each request goes out once, and every email has a stop link. | `prayer_chain_enabled` (also needs feature 1 on) |
| 3 | "Prayed for you today" on the widget | The existing Pray now widget adds one line: "💛 Ana and 2 others prayed for you today". | `prayed_for_widget_enabled` |
| 4 | Prayer minute | Under Me → **My prayer minute**, the member picks one minute a day. At that minute they get a gentle notice saying how many others chose the same moment. The screen shows a real count of people who have it open and three requests that were prayed for least today. | `prayer_minute_enabled` |
| 5 | Sharing only with consent | Under their own post, the author picks **Who can share this outside the app?**: **Only me** (the default), **Members can send a link** (the link needs the app; the words never leave), or **Anyone can share a card** (a web page at `/card/<code>` with the words, and the first name unless the post is anonymous). Everyone else's **Share outside** button sends only what the author chose, or says the post stays inside the app. Comments can be shared only by the person who wrote them. | `share_consent_enabled` |

In Open Circle, links are `/circle/<code>` instead of `/pray/<code>`. The pages wear Open Circle's brand, and the wording is "I'm thinking of you", "support circle" and "kindness minute". No religious words appear.

## Rules the code enforces

- **Guests never earn tokens,** and their prayers never count as verified. A guest prayer is stored apart from member prayers (`guest_prayers`), not in `prayer_events`.
- **Only the asker can make a link,** and only for their own visible, open prayer request. They can turn it off at any time. Turning guest prayer off, removing the request, or revoking the link makes the page a 404.
- **Spam limits:** one guest prayer per network per link per day, a hidden field that catches bots, and 20 requests a minute per IP address on the public pages. The network address is never stored, only a keyed hash (set `GUEST_IP_SALT` to keep it stable across restarts).
- **Guest emails** are kept only when the box is ticked. Each one is erased as soon as the answered email goes out, or after `guest_email_days` (90 by default) by the nightly `growth_purge`.
- **Prayer chain consent:** nothing is sent to an address until it says yes on the web page. Opening the emailed link changes nothing; only the button does, so mail scanners can't sign anyone up. An address that said no is never asked again by the same member. Invites with no answer are deleted after 30 days. A chain holds up to `prayer_chain_max` people (50 by default), and a member can add up to 20 a day.
- **Widget names** are first names only, and never anyone who prayed anonymously. If only anonymous people prayed, it shows a count.
- **Prayer minute counts are real:** people who chose the same moment in any time zone, and people with the screen open in the last two minutes. The screen never shows the member's own, sensitive, crisis, answered, hidden or blocked requests.

- **Sharing consent:** with feature 5 on, nothing about a post leaves the app unless its author chose it. Only the author can change the choice. Going back to **Only me** deletes the card link for good; a new card gets a new link. A post that mentions crisis can never be a card. The card page is read-only, `noindex`, and a 404 while the switch is off or the post is hidden. If the author also made a guest link (feature 1), the card points to it.

## Server settings

| Variable | What it does |
|---|---|
| `PUBLIC_SITE_URL` | This API host's public address, for example `https://api.<your-domain>`. Prayer-chain and answered emails link to it. Unset = those emails are not sent. |
| `SMTP_URL`, `MAIL_FROM` | The same mail settings as the weekly digest. Unset = no email. |
| `GUEST_IP_SALT` | Optional. Keeps the guest spam-check hash stable across restarts. |

The app builds the share link from `EXPO_PUBLIC_LINK_URL`, the same as other shared links ([APP_LINKS.md](APP_LINKS.md)).

## API

| Method | Path | Who |
|---|---|---|
| GET / PATCH | `/admin/growth-settings` | admins |
| GET / POST / DELETE | `/posts/:id/guest-link` | the asker |
| GET / POST | `/pray/:token`, `/circle/:token` | anyone (the public page and its form) |
| GET | `/posts/:id/share` | anyone who can see the post (what they may send) |
| PUT | `/posts/:id/share` | the author (`{ level: 'private' \| 'link' \| 'card' }`) |
| GET | `/card/:token` | anyone (the share card) |
| GET / POST / DELETE | `/me/prayer-chain`, `/me/prayer-chain/:id` | members |
| POST | `/posts/:id/prayer-chain` | the asker |
| GET / POST | `/chain/:token` | anyone with the emailed link (join or stop) |
| GET | `/me/prayed-for` | members |
| GET / PUT / DELETE | `/me/prayer-minute` | members |
| GET | `/prayer-minute/now` | members |
| POST | `/prayer-minute/join` | members |

Background jobs: `growth_guest_answered`, `growth_chain_confirm` and `growth_chain_send` (queued), `growth_prayer_minute` (every minute) and `growth_purge` (daily at 03:20 UTC).

## Known limits

- The widget refreshes its prayed-for line when the app loads the feed, the same as the rest of the widget. It doesn't change between app opens. A server push straight to the widget, or a Live Activity, would need extra Apple setup and isn't built.
- Sending a prayer chain by text message (SMS) isn't built. It needs a paid SMS provider, so it goes last under the money rule.
- An anonymous request sent to the member's own prayer chain carries their first name in the email, because the member chose to send it to people who know them.

## Before switching on

1. Set `PUBLIC_SITE_URL` and `SMTP_URL` on the server and the worker.
2. Admin → Growth ideas: turn on the features you want.
3. Try each one on a test request: share the link, open it in a private browser window, tap I prayed, then mark the request answered.
