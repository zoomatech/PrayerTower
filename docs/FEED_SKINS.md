# Feed skins, comment trees and the video cap

Steve, 2026-10-29: the feed grows by lines or connectors that can look like never-ending vines, beanstalks or elven trees, or like one solid wall of full-screen posts. Members can suggest themes. Comment trees show as leaves and branches, but stay small: this is for prayer requests and encouragement, not debate. Short videos are capped at 7 seconds for now.

Everything here is **off** until an admin turns it on in **Admin → Feed skins** (table `skin_settings`, module `apps/server/src/modules/skins`).

## Switches

| Switch | Default | What it does |
|---|---|---|
| Show the new feed skins | off | Adds Beanstalk, Golden Wood, Moonlit Gate and Wall to Me → Feed style. Turning it off sends anyone using one back to the plain column. |
| Comments as branches and leaves | off | Comments on a request show as leaves on branches. |
| Leaves shown on a branch before the blur | 5 | Past this, the other leaves fade into a blur ("12 more leaves on this branch") until tapped. |
| Levels of comments | 3 | Comment, reply, reply to that. At the third level there is no Reply link, and the server refuses a deeper reply, so a back-and-forth chain can't grow. Side branches at the third level are fine. |
| Members can suggest skins | off | Me → Suggest a feed skin. Admins approve or decline in Admin → Feed skins. |
| Longest video, in seconds | 7 | The composer leaves out longer clips. The server refuses a clip longer than the cap. |

## The skins

A skin is a row in `feed_themes`. Its look is in `tokens` (JSON), so a new vine skin needs a migration or an admin edit, never an app release. Skins with `gated = true` show only while the switch is on.

| Skin | Layout | Look |
|---|---|---|
| Beanstalk | vine | Thick green stalk (10 pt), round leaves, pale green backdrop |
| Golden Wood | vine | Silver-grey trunk, pointed gold leaves, cream backdrop, no bird |
| Moonlit Gate | vine | Doubled silver line like engraved tracery, pointed pale leaves, cool stone backdrop |
| Wall | wall | One post per screen on a dark backdrop, hard snap per swipe, like a short-video app |

Vine tokens (all optional): `stem`, `leaf`, `leafSoft`, `branch`, `tendril`, `backdrop`, `stemWidth` (2–14), `stemDouble`, `leafShape` (`round` or `pointed`), `leafEvery`, `idleBirdSeconds`, `birdText`, `tipText`. Wall tokens: `backdrop`.

Open Circle gets the same skins. They carry no religious words, and the vine's Open Circle wording still replaces `birdText` and `tipText`.

## Comment trees

`apps/mobile/src/components/comment-tree.tsx`. Each comment is a leaf with a twig to its branch, colored from the member's vine skin (or the plain vine's colors). New leaves grow in with a short spring, and tapping the blur shuffles the hidden leaves forward. Both animations stay off for anyone whose device asks for reduced motion. A shared comment link opens the branches that hold it.

## Member skin ideas

A member sends a name, a description, vine or wall, and three colors (#RRGGBB). Up to 3 can wait at once. Approving one creates a gated beta skin in the member's community from those colors, and admins can retune its tokens later. Ideas are in the member's data export and are deleted with the account.

## Using Claude Design for new skins

Claude Design is Anthropic's tool for making designs and prototypes by chatting with Claude ([Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)). What the official pages say, checked 2026-10-29:

- It can build a design system "by reading your codebase and design files" ([Introducing Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs)). Point it at this repo, or bring one in with `/design-sync` in Claude Code.
- When a design is ready, "Claude packages everything into a handoff bundle that you can pass to Claude Code with a single instruction" (same page).
- Exports: .zip, PDF, PPTX, Google Slides and standalone HTML ([support article](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)).
- It's on Free, Pro, Max, Team and Enterprise plans, and design work counts toward the plan's usage limits. The standalone site at claude.ai/design closes on December 14, 2026, because Claude Design now lives in Claude (same article).

How it fits here:

1. In Claude Design, mock a skin on a phone frame: the stem or connector, the leaves, the backdrop, the comment tree.
2. Hand the design to Claude Code. Ask it to turn the design into `feed_themes` tokens (a migration with one `insert`), using the token list above.
3. If the design needs a shape the tokens can't draw (a carved arch, a new kind of connector), that's a new field in `vineTokens()` in `apps/mobile/src/layouts/vine.tsx`, and one app release.

## Video cap: why 7 seconds

Before this change, nothing limited how long a video could be. The only limit was the `post-media` bucket's 100 MB file size, and the Supabase Free plan caps uploads at 50 MB anyway.

Sizes: Apple's HLS authoring spec lists 1280×720 H.264 at 3,000–4,500 kbit/s ([Apple](https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices)). The composer now asks iOS to export picked clips at 1280×720 H.264 (`videoExportPreset: H264_1280x720`, [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)). So a 7-second clip is about 2.6–3.9 MB.

Supabase Free has 1 GB of file storage and 5 GB of egress a month; Pro has 100 GB and 250 GB, then $0.09 per GB of egress ([Supabase pricing](https://supabase.com/pricing)).

| Cap | One clip | Clips that fit in 1 GB | Views in 5 GB a month |
|---|---|---|---|
| **7 s** | about 3–4 MB | about 250–380 | about 1,300–1,900 |
| 15 s | about 6–8 MB | about 120–170 | about 600–850 |
| 60 s | about 23–34 MB | about 30–45 | about 150–220 |

At 10 pilot members, one clip each a week, seen by the other 9: about 43 clips (about 170 MB) and 390 views (about 1.5 GB) a month. That fits Free with room for photos. At 60 seconds the same use would pass the 5 GB egress limit. Raise the cap in Admin → Feed skins when the platform is ready for longer video.

`videoMaxDuration` limits recording length; Expo's page doesn't say it trims clips picked from the library, so the composer checks each clip's `duration` and the server checks the `durationMs` the app sends. A clip from an old app build without `durationMs` still goes through.

## Notes for the legal department

The skins use our own names (Golden Wood, Moonlit Gate). Middle-earth Enterprises holds many Tolkien trademarks ([Justia listing](https://trademarks.justia.com/owners/middle-earth-enterprises-llc-5365969)), so Tolkien's place names stay out of the app and store text until legal checks them. The skins are only inspired by golden woods and moonlit stone gates.
