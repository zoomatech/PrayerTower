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
| Skin gallery | off | Me → Skin gallery: every skin the member can use, with a small preview, who made it, likes, and "Use this skin". Needs the skins switch on too. |
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

## Seasonal skins

Admin → Feed skins → **Seasonal skins** (off) offers each season's skin in Feed style only during its season. **Use the season's skin for members who haven't chosen one** (off) dresses members on the community's usual feed by date; anyone who picked a style keeps it, and a seasonal pick falls back to the usual feed when its season ends.

| Season | Dates | Faith communities | Open Circle |
|---|---|---|---|
| Advent | Fourth Sunday before Christmas to 24 December | Advent Wreath (evergreen stem, purple leaves) | |
| Christmas | 25 December to 5 January | Christmas Star (gold glow on night blue, star leaves) | |
| Lent | Ash Wednesday (Easter − 46 days) to Holy Saturday | Lenten Desert (sand, violet leaves) | |
| Easter | Easter Sunday to the day before Pentecost (Easter + 49) | Easter Lily (cream, gold flowers) | |
| Pentecost | Pentecost Sunday and its week | Pentecost Flame (glowing flame on deep red) | |
| Winter / spring / summer / autumn | December–February, March–May, June–August, September–November | | Winter Frost, Spring Bloom, Summer Sun, Autumn Leaves |

Church dates follow the Western calendar ([United Methodist glossary](https://admin.umc.org/content/glossary-calendar-christian), [Columban Missionaries](https://www.columban.org.au/media-and-publications/articles/features/2015/liturgical-seasons-explained)); Easter is computed with the anonymous Gregorian algorithm (`easterSunday()` in `packages/shared`). Open Circle uses the northern-hemisphere weather seasons. Every seasonal skin passes the contrast checks below. New ones can be added from a skin file with a `season` (docs/CLAUDE_DESIGN_SKINS.md).

## Prayer Tower (climb layout)

`apps/mobile/src/layouts/tower.tsx`. Phones and tablets. One request per floor between two stone pillars; the climber climbs one floor each time the member swipes to the next request, with Climb up and Climb down buttons for anyone who prefers tapping. A long request scrolls inside its floor, and the swipe only climbs once the floor is read to its edge.

**Scroll direction.** Research on touch screens finds people respond best when the content moves the same way as the finger ("response-effect compatibility", [MetaTOC summary of the Human Factors paper](https://metatoc.com/papers/1356-response-effect-compatibility-defines-the-natural-scrolling-direction); [Penn State study](https://pure.psu.edu/en/publications/stimulus-response-and-response-effect-compatibility-with-touchles/); [SlashGear on the subjectivity of natural scrolling](https://www.slashgear.com/the-subjectivity-of-natural-scrolling-05169915)). So the default is **Swipe down to climb** (pull the tower down past you, so the climber rises). **Swipe up to climb** is offered as a setting chip on the tower itself, for members who want to try the counter-intuitive direction. The choice is saved on the device. Reduced motion turns off the climber's bob and the brick animation.

## Accessibility and speed (checked 2026-10-29)

**Reduce Motion.** Every layout reads iOS Reduce Motion (and the matching Android and browser settings) through `apps/mobile/src/lib/motion.ts`. While it is on: the vine's leaves and bird hold still, the tower's climber and bricks stop, Neon Circuit's bursts stop (the wire stays), comment leaves appear without the spring or shuffle, Swipe cards leave without flying or tilting, and Flip pages snap without turning. Checked in the browser build with Reduce Motion on: Neon Circuit's screen is identical a second apart.

**Contrast.** Every skin's text was measured against the WCAG AA 4.5:1 ratio for normal text. All pass. Lowest per skin: Golden Wood 4.75, Moonlit Gate 4.83, Blossom Garden 5.37, Vine 5.42, Beanstalk 5.46, Neon Circuit 6.3, Neon Cinderella 11.0, Prayer/Climbing Tower 13.2, Wall 16.0. Neon Cinderella's "Pinned", "Your branch" and "Answered" tags failed on its dark background (2.4 to 3.4) and now switch to light colors there (11 to 14). The stems, branches and tower stones are decoration, not information, so the 3:1 rule for graphics doesn't apply to them ([Deque on WCAG 1.4.11](https://dequeuniversity.com/resources/wcag2.1/1.4.11-non-text-contrast), [Stark](https://getstark.co/wcag-explained/perceivable/distinguishable/non-text-contrast)). The theme maker, and the server behind it, refuse a member's comment background darker than 4.5:1 against the comment text.

**Frame rate.** Measured in the web build on an iPhone SE screen with the CPU slowed 4× (Chrome's low-end mobile setting, [Chrome DevTools](https://developer.chrome.com/docs/devtools/settings/throttling), [DebugBear](https://www.debugbear.com/blog/cpu-throttling-in-chrome-devtools-and-lighthouse)). Every skin held about 60 fps standing still and while scrolling, with at most 2 slow frames (worst 117 ms) over 25 quick scrolls; the busiest were Neon Circuit, Neon Cinderella and Blossom Garden. This is a stand-in: the native app draws animations on the UI thread (`useNativeDriver`), so a real older iPhone should do as well or better. Confirm on a device during the pilot. Raw numbers: `build/screenshots/skins/all/frame-rate.json` in project files, next to a screenshot of every skin on the older-iPhone and iPad profiles.

## Emoji word leaves

The emoji meanings under a post (docs/EMOJI_MEANINGS.md, its own switch) take the member's feed skin: leaf colors on vine skins, a flower before the word on Blossom Garden, a star on Neon Cinderella, stone tablets outlined in mortar on the Prayer Tower, and a neon outline on Neon Circuit. Plain layouts (column, swipe, flip, wall) keep the plain chip. Your own word keeps the skin's colors with a heavier outline. Code: `wordLeafTokens()` in `apps/mobile/src/components/meaning-reactions.tsx`. Screenshots: `build/screenshots/skins/word-leaves/` in project files.

## The drawn vine (Steve, 2026-10-29)

Steve: "FAR more spaced out and actual artistic curved vines connecting, and the comments are HOUSED inside a leaf." "Top to bottom, present to past." "Comments spread outward and downward toward the next last post."

Every vine skin now draws the vine as a transparent picture (`react-native-svg`, `apps/mobile/src/components/vine-flow.tsx`) behind the posts:

- Each request sits **inside** a large leaf: square, with two pointed corners (the base by the vine and the tip opposite) and a midrib between them.
- The vine runs in the margin beside each leaf and swoops across the open space between leaves in a smooth S-curve (56–80 pt of space above each request). A short stalk joins it to the leaf's base. Tendrils curl off it, and small leaves sit on each swoop.
- The feed reads top to bottom, newest first. Under each request, its newest comments (up to 3, newest first) hang on smaller leaves, alternating sides, spreading down toward the next older request. "N more comments" fades into ghost leaves and opens the request. The server sends these only while comments as leaves is on (`Card.leafComments`), and leaves out anyone the viewer blocked.
- Tag colors on a leaf (Pinned, Answered, Your branch, Your tendril) keep 4.5:1 contrast with the leaf color; a skin whose leaf color is too close gets dark or light text instead.

## iPad and Mac (wide screens)

- Window widths: 768 pt and up counts as wide (an upright iPad), and 1280 pt and up as very wide (iPad landscape, a Mac window).
- **Feed:** on a wide window the feed sits beside the week's highlights. On a very wide window the plain column shows two cards side by side. The skins get one roomier lane (880 pt), so the vine swoops across more space and the leaves stay easy to read. The tower keeps its own 680 pt width.
- **Post page:** while comments as leaves is on, the post page widens to 880 pt on a very wide window.
- **Theme maker:** the form is on the left, and a large live preview (380 pt tall) stays in view on the right.
- **Skin gallery:** 1, 2 or 3 columns, with larger previews on wide windows.
- Screenshots: `build/screenshots/skins/wide/` (iPad landscape 1366×1024 and Mac 1512×900).

## Comment trees

`apps/mobile/src/components/comment-tree.tsx`. On a vine skin the comments on a request read top to bottom, present to past: the newest comment is the top leaf, each comment sits inside a pointed leaf on the same drawn vine, alternating sides, and replies hang below their comment on the same side on smaller leaves (to the third level). The older comments past the first few fade into the blur until tapped. New leaves grow in with a short spring, and tapping the blur brings the older leaves forward. Both animations stay off for anyone whose device asks for reduced motion. A shared comment link opens the branches that hold it. Stars mark the leaves on Neon Cinderella and flowers on Blossom Garden. On the tower, comments stay stone tablets and smaller sub-tablets.

## Theme maker (members make their own skins)

Me → Make your own feed skin (`apps/mobile/src/app/skin-idea.tsx`). A member names the skin, picks a layout (growing vine, full-screen wall, climbing tower or neon circuit), sets its colors, and for vines picks the comment shape (round, pointed, flower, star, stone tablet), stem width, double outline, glow and fairy-tale scenery. A live preview updates as they go.

Saving creates a private skin owned by the member (`feed_themes.owner_id`); it shows at once in their own Feed style. Everyone else sees it only after an admin approves it in Admin → Feed skins, which offers it in the member's community (still behind the skins switch). Declining leaves it private. The server accepts only known token names and values (hex colors, set ranges, listed shapes), so a skin can't inject anything else. Up to 3 can wait for review at once. Skins and ideas are in the member's data export and are deleted with the account.

## Skin gallery

Me → Skin gallery (`apps/mobile/src/app/skin-gallery.tsx`, `GET /skins/gallery`). It lists the skins offered in the member's community, plus their own private skins, with the same small preview the theme maker uses (`components/skin-preview.tsx`). Seasonal skins show only while their season is on. Members can like a skin (♥, one like per member, table `theme_likes`) and the list sorts by likes, then name. "Use this skin" sets it as their Feed style. The grid is 1 column on a phone, 2 on an iPad and 3 on a wide Mac window. Likes are in the member's data export and are deleted with the account.

## Using Claude Design for new skins

Step-by-step guide, prompt and skin file: [CLAUDE_DESIGN_SKINS.md](CLAUDE_DESIGN_SKINS.md).

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
