# Feed skins, comment trees and the video cap

Steve, 2026-10-29: the feed grows by lines or connectors that can look like never-ending vines, beanstalks or elven trees, or like one solid wall of full-screen posts. Members can suggest themes. Comment trees show as leaves and branches, but stay small: this is for prayer requests and encouragement, not debate. Short videos are capped at 7 seconds for now.

Everything here is **off** until an admin turns it on in **Admin → Feed skins** (table `skin_settings`, module `apps/server/src/modules/skins`).

## Switches

| Switch | Default | What it does |
|---|---|---|
| Show the new feed skins | off | Adds Beanstalk, Golden Wood, Moonlit Gate, Wall, Prayer Tower (Climbing Tower in Open Circle), Neon Cinderella, Neon Circuit and Blossom Garden to Me → Feed style. Turning it off sends anyone using one back to the plain column. |
| Comments as branches and leaves | off | Comments on a request show as leaves on branches. |
| Leaves shown on a branch before the blur | 5 | Past this, the other leaves fade into a blur ("12 more leaves on this branch") until tapped. |
| Levels of comments | 3 | Comment, reply, reply to that. At the third level there is no Reply link, and the server refuses a deeper reply, so a back-and-forth chain can't grow. Side branches at the third level are fine. |
| Members can make their own skins | off | Me → Make your own feed skin (the theme maker). The maker can use their skin at once; everyone else sees it only after an admin approves it in Admin → Feed skins. |
| Longest video, in seconds | 7 | The composer leaves out longer clips. The server refuses a clip longer than the cap. |

## The skins

A skin is a row in `feed_themes`. Its look is in `tokens` (JSON), so a new vine skin needs a migration or an admin edit, never an app release. Skins with `gated = true` show only while the switch is on.

| Skin | Layout | Look |
|---|---|---|
| Beanstalk | vine | Thick green stalk (10 pt), round leaves, pale green backdrop |
| Golden Wood | vine | Silver-grey trunk, pointed gold leaves, cream backdrop, no bird |
| Moonlit Gate | vine | Doubled silver line like engraved tracery, pointed pale leaves, cool stone backdrop |
| Wall | wall | One post per screen on a dark backdrop, hard snap per swipe, like a short-video app |
| Prayer Tower / Climbing Tower | tower | Stone pillars and a climber avatar 🧗; one request per floor; comments are stone tablets and sub-tablets |
| Neon Cinderella | vine | Dark night backdrop, glowing pink stem, star-shaped leaves, and neon outline drawings (castle, pumpkin coach, glass slipper) after every third request |
| Neon Circuit | circuit | Each post glows inside its own screen, tilted left or right; one live wire runs down the edge with a tap into each screen, and gentle bursts of light travel down it |
| Blossom Garden | vine | Soft pink backdrop, green stem, five-petal flowers instead of leaves; comments bloom as flowers |

Vine tokens (all optional): `stem`, `leaf`, `leafSoft`, `branch`, `tendril`, `backdrop`, `stemWidth` (2–14), `stemDouble`, `leafShape` (`round`, `pointed`, `flower`, `star`, `tablet`), `stemGlow`, `scenery` (`fairytale` or empty), `leafEvery`, `idleBirdSeconds`, `birdText`, `tipText`. Wall tokens: `backdrop`. Tower tokens: `stone`, `mortar`, `backdrop`, `climber`. Circuit tokens: `backdrop`, `wire`, `burst`, `screen`, `tilt` (0–20 degrees).

Open Circle gets the same skins. They carry no religious words, and the vine's Open Circle wording still replaces `birdText` and `tipText`.

## Prayer Tower (climb layout)

`apps/mobile/src/layouts/tower.tsx`. Phones and tablets. One request per floor between two stone pillars; the climber climbs one floor each time the member swipes to the next request, with Climb up and Climb down buttons for anyone who prefers tapping. A long request scrolls inside its floor, and the swipe only climbs once the floor is read to its edge.

**Scroll direction.** Research on touch screens finds people respond best when the content moves the same way as the finger ("response-effect compatibility", [MetaTOC summary of the Human Factors paper](https://metatoc.com/papers/1356-response-effect-compatibility-defines-the-natural-scrolling-direction); [Penn State study](https://pure.psu.edu/en/publications/stimulus-response-and-response-effect-compatibility-with-touchles/); [SlashGear on the subjectivity of natural scrolling](https://www.slashgear.com/the-subjectivity-of-natural-scrolling-05169915)). So the default is **Swipe down to climb** (pull the tower down past you, so the climber rises). **Swipe up to climb** is offered as a setting chip on the tower itself, for members who want to try the counter-intuitive direction. The choice is saved on the device. Reduced motion turns off the climber's bob and the brick animation.

## Accessibility and speed (checked 2026-10-29)

**Reduce Motion.** Every layout reads iOS Reduce Motion (and the matching Android and browser settings) through `apps/mobile/src/lib/motion.ts`. While it is on: the vine's leaves and bird hold still, the tower's climber and bricks stop, Neon Circuit's bursts stop (the wire stays), comment leaves appear without the spring or shuffle, Swipe cards leave without flying or tilting, and Flip pages snap without turning. Checked in the browser build with Reduce Motion on: Neon Circuit's screen is identical a second apart.

**Contrast.** Every skin's text was measured against the WCAG AA 4.5:1 ratio for normal text. All pass. Lowest per skin: Golden Wood 4.75, Moonlit Gate 4.83, Blossom Garden 5.37, Vine 5.42, Beanstalk 5.46, Neon Circuit 6.3, Neon Cinderella 11.0, Prayer/Climbing Tower 13.2, Wall 16.0. Neon Cinderella's "Pinned", "Your branch" and "Answered" tags failed on its dark background (2.4 to 3.4) and now switch to light colors there (11 to 14). The stems, branches and tower stones are decoration, not information, so the 3:1 rule for graphics doesn't apply to them ([Deque on WCAG 1.4.11](https://dequeuniversity.com/resources/wcag2.1/1.4.11-non-text-contrast), [Stark](https://getstark.co/wcag-explained/perceivable/distinguishable/non-text-contrast)). The theme maker, and the server behind it, refuse a member's comment background darker than 4.5:1 against the comment text.

**Frame rate.** Measured in the web build on an iPhone SE screen with the CPU slowed 4× (Chrome's low-end mobile setting, [Chrome DevTools](https://developer.chrome.com/docs/devtools/settings/throttling), [DebugBear](https://www.debugbear.com/blog/cpu-throttling-in-chrome-devtools-and-lighthouse)). Every skin held about 60 fps standing still and while scrolling, with at most 2 slow frames (worst 117 ms) over 25 quick scrolls; the busiest were Neon Circuit, Neon Cinderella and Blossom Garden. This is a stand-in: the native app draws animations on the UI thread (`useNativeDriver`), so a real older iPhone should do as well or better. Confirm on a device during the pilot. Raw numbers: `build/screenshots/skins/all/frame-rate.json` in project files, next to a screenshot of every skin on the older-iPhone and iPad profiles.

## Emoji word leaves

The emoji meanings under a post (docs/EMOJI_MEANINGS.md, its own switch) take the member's feed skin: leaf colors on vine skins, a flower before the word on Blossom Garden, a star on Neon Cinderella, stone tablets outlined in mortar on the Prayer Tower, and a neon outline on Neon Circuit. Plain layouts (column, swipe, flip, wall) keep the plain chip. Your own word keeps the skin's colors with a heavier outline. Code: `wordLeafTokens()` in `apps/mobile/src/components/meaning-reactions.tsx`. Screenshots: `build/screenshots/skins/word-leaves/` in project files.

## Comment trees

`apps/mobile/src/components/comment-tree.tsx`. Each comment is a leaf with a twig to its branch, colored from the member's vine skin (or the plain vine's colors). New leaves grow in with a short spring, and tapping the blur shuffles the hidden leaves forward. Both animations stay off for anyone whose device asks for reduced motion. A shared comment link opens the branches that hold it. The comment pieces follow the skin: stone tablets and smaller sub-tablets on the tower, stars on Neon Cinderella, flowers on Blossom Garden.

## Theme maker (members make their own skins)

Me → Make your own feed skin (`apps/mobile/src/app/skin-idea.tsx`). A member names the skin, picks a layout (growing vine, full-screen wall, climbing tower or neon circuit), sets its colors, and for vines picks the comment shape (round, pointed, flower, star, stone tablet), stem width, double outline, glow and fairy-tale scenery. A live preview updates as they go.

Saving creates a private skin owned by the member (`feed_themes.owner_id`); it shows at once in their own Feed style. Everyone else sees it only after an admin approves it in Admin → Feed skins, which offers it in the member's community (still behind the skins switch). Declining leaves it private. The server accepts only known token names and values (hex colors, set ranges, listed shapes), so a skin can't inject anything else. Up to 3 can wait for review at once. Skins and ideas are in the member's data export and are deleted with the account.

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

Neon Cinderella's drawings (castle, pumpkin coach, glass slipper) are our own simple line drawings built from shapes in `apps/mobile/src/layouts/motifs.tsx`, not traced or copied from any film or park. The Cinderella story itself is an old folk tale (Perrault's 1697 version; see [Britannica Kids](https://kids.britannica.com/students/article/Cinderella/319708) and [The Legal Guide](https://thelegalguide.org/is-cinderella-story-public-domain/)), but a studio's own designs and characters are not. Keep the skin's name and art generic, and have legal check before any store text names Cinderella.
