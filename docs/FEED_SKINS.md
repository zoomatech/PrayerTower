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
| Moonlit Gate | vine | Fine lines of silver light on a night sky: a drawn gate at the top of the feed (pillars, arch, ring of stars, a large star, two trees, a crescent moon), a thread of light down from its doorway, and each post in an arched doorway of light |
| Wall | wall | One post per screen on a dark backdrop, hard snap per swipe, like a short-video app. Videos fill the page and play by themselves, muted and looping at the 7-second cap, only on the page on screen |
| Prayer Tower / Climbing Tower | tower | Drawn walls of dressed stone, a climber on a rope, battlements at the top; one request per floor, carved on a stone tablet, with its newest comments on smaller sub-tablets hung below it |
| Neon Cinderella | vine | Dark night backdrop, glowing pink neon rods with sparks of current running down them, cut-corner tube frames, and neon tube drawings (a castle with spires and pennants, a pumpkin coach with spoked wheels, a clock at midnight, a glass slipper) after every third request |
| Neon Circuit | circuit | Each post glows inside its own screen, tilted left or right; one live wire runs down the edge with a tap into each screen, and gentle bursts of light travel down it |
| Blossom Garden | vine | A climbing rose: a slender green stem twined with a pink tendril, small thorns, blossoms and buds along it; each post in a frame with a scalloped petal edge, a drawn rose at its top and blossoms at its foot; comments in smaller petal frames with a blossom |

Vine tokens (all optional): `stem`, `leaf`, `leafSoft`, `branch`, `tendril`, `backdrop`, `stemWidth` (2–14), `stemDouble`, `leafShape` (`round`, `pointed`, `flower`, `star`, `tablet`), `stemGlow`, `scenery` (`fairytale` or empty), `vineStyle` (`beanstalk`, `ink`, `neon`, `gate`, `floral` or empty), `ink`, `leafEvery`, `idleBirdSeconds`, `birdText`, `tipText`. Wall tokens: `backdrop`. Tower tokens: `stone`, `mortar`, `backdrop`, `climber`. Circuit tokens: `backdrop`, `wire`, `burst`, `screen`, `tilt` (0–20 degrees).

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

**Second pass (2026-10-29, after the drawn skins).** Re-checked all 17 skins after the drawn vine, tower, gate, floral and neon art.
- *Screen readers.* axe (WCAG 2.2 AA) at iPhone size and at 320 px, on the feed and on a post page, found one problem: the blurred "more leaves" behind the frosted glass were read aloud inside their button. They are now hidden, and the button is named by its visible words. Every drawing (vine, tablets, walls, gate, neon scenes) is hidden from screen readers on the web too, as it already was in VoiceOver. Reading order (Beanstalk, Prayer Tower, Neon Cinderella): the post, its actions, then its comment leaves, then the tab bar.
- *Larger text.* Text grows with the phone's text size everywhere; only the icons that sit inside a fixed circle (the six action icons, the wall's sound button, an emoji climber) stop at 1.3× so they don't spill out. Their words are in the label and the long-press tip.
- *Contrast.* Leaf, tablet and neon-frame text all keep 4.5:1; the tablet face is picked by `tabletFace()` to keep it.
- *Speed* (same iPhone SE profile, CPU 4× slower, 25 quick scrolls). The slow frames came from the whole vine feed redrawing once a second while scrolling (the idle bird's timer); the bird now keeps its own timer. Drawn leaves also mount two rows at a time, the stone wall is drawn once, and Neon Cinderella has a spark on every third rod instead of every rod. Slow frames, before → after: Beanstalk 6 → 3, Moonlit Gate 10 → 3, Neon Cinderella 8 → 8 (worst frame 233 → 167 ms), Golden Wood 7 → 7, Blossom Garden 10 → 5, Vine 5 → 4, Prayer Tower 7 → 7 (one per floor change, while the next floor is built). Standing still, every skin holds 60 fps. Tests showed the blur, glow and drawings themselves are not the cost (turning each off changed nothing). Raw numbers: `build/screenshots/skins/a11y-speed/frame-rate.json` (and `frame-rate-before.json`), axe results in `axe-problems.txt`, reading order in `*-reading-order.txt`, and a 320 px and older-iPhone screenshot of every skin, all in project files.

## Emoji word leaves

The emoji meanings under a post (docs/EMOJI_MEANINGS.md, its own switch) take the member's feed skin: leaf colors on vine skins, a flower before the word on Blossom Garden, a star on Neon Cinderella, stone tablets outlined in mortar on the Prayer Tower, and a neon outline on Neon Circuit. Plain layouts (column, swipe, flip, wall) keep the plain chip. Your own word keeps the skin's colors with a heavier outline. Code: `wordLeafTokens()` in `apps/mobile/src/components/meaning-reactions.tsx`. Screenshots: `build/screenshots/skins/word-leaves/` in project files.

## The drawn vine (Steve, 2026-10-29)

Steve: "FAR more spaced out and actual artistic curved vines connecting, and the comments are HOUSED inside a leaf." "Top to bottom, present to past." "Comments spread outward and downward toward the next last post." "THE LINES CONNECTING ARE PRIMARILY VERTICAL", like the fairy-tale beanstalk. The inner box "much smaller than the containing leaf", greener, with "an actual leaf shape seen through it"; the box may cross the leaf's edge so the leaf stays natural.

Every vine skin draws the plant as a transparent picture (`react-native-svg`, `apps/mobile/src/components/vine-flow.tsx`):

- One tall stalk runs top to bottom. On a phone it runs down the left edge with the leaves to its right. On a lane at least 760 pt wide (iPad, Mac) it runs down the middle with leaves on both sides. Each post hangs off it on a short curved stem.
- Each post sits on a whole drawn leaf (pointed base and tip, midrib, veins), in a smaller box tinted toward the leaf color. The tint stops before dark text would drop under 4.5:1.
- The feed reads newest first. Under each post, its newest comments (up to 3) hang on smaller leaves that step a little further from the stalk. "N more comments" opens the post. The server sends these only while comments as leaves is on (`Card.leafComments`), and leaves out anyone the viewer blocked.
- Tag colors (Pinned, Answered, Your branch, Your tendril) keep 4.5:1 against what is under them.
- Token `vineStyle`:
  - `beanstalk` (Beanstalk): two thick strands that twist round each other, with curling tendrils.
  - `ink` (Golden Wood): a pen-and-ink drawing, with dark outlines (`ink` color) on the trunk, leaves and boxes, and flat colors.
  - `neon` (Neon Cinderella): no plant at all. It draws straight glowing rods with right-angle joins and cut-corner frames. Each tube has a faint wide bloom, a brighter halo and a thin white core. The castle, coach and slipper drawings stay.
  - `floral` (Blossom Garden): a climbing rose. See the table above.
  - `gate` (Moonlit Gate): fine lines of silver light on the night sky. The feed opens with a drawn gate, and its line of light runs down from the doorway. Each post and comment sits in an arched doorway drawn in light, with a star at the top of the arch. On a post's page the comments keep the night sky behind them.
- Neon Circuit's wire and screens use the same tube look: a white core with the color blooming round it.

## Motion (2026-10-29)

All of it stops with the system's Reduce Motion setting.

- **A new post grows in.** Posts already in the feed when it opens settle in gently. A post that arrives later (after a refresh) grows in: the stalk is drawn down into its row, then the post unfurls from its stem.
- **Leaves shuffle.** When a comment or post arrives, the leaves below spring down to make room (`LayoutAnimation`, iPhone and iPad).
- **Frosted overflow.** Past the first few leaves (3 in the feed, the "Leaves shown" setting on a post), the next older comments wait in their real leaves behind frosted glass (`expo-blur`). A clear "N more" label sits on top; tapping it brings them forward. The blurred text is hidden from screen readers, and the label says how many there are.
- **Neon current.** On Neon Cinderella a spark with a fading tail runs down each glowing rod, again and again. Neon Circuit's wire bursts are unchanged.

## Drawn tower (2026-10-29)

`apps/mobile/src/components/stone-tablet.tsx`, used by `layouts/tower.tsx` and the post page's comment tree on the tower skins:

- The two walls are drawn stone: courses of dressed blocks, each a slightly different shade, with a lit top edge and mortar joints. They scroll past as the climber goes up.
- The climber is drawn: helmet, jacket and pack, hands on a rope that hangs from the top of the screen, boots braced on the wall. A skin can still set its own `climber` emoji.
- Each request is carved on a stone tablet (rounded top, square foot, bevelled edge, chisel marks, a pale smoothed face). Its newest comments (up to 3) hang below on smaller sub-tablets, each on a short iron chain. "N more comments" opens the post, where every comment is a sub-tablet and replies are smaller again.
- The top floor has battlements.
- The tablet face is picked so dark, muted and link text all keep 4.5:1.

## Full-screen wall video (2026-10-29)

`layouts/wall.tsx` tells each page whether it is the one on screen (`WallPage` in `components/media.tsx`). On that page a video fills a tall 9:16 frame and plays by itself, muted and looping, the way short-video apps do. It loops at the video cap (7 seconds by default) even if an older clip is longer, using expo-video's `timeUpdate` event ([Expo Video](https://docs.expo.dev/versions/latest/sdk/video/)). A sound button turns the sound on. Pages off screen show a play button and hold no player, so only one video plays at a time. With reduced motion on, nothing plays until the member taps. A video post leaves out its comment preview so the whole post fits one screen; its comments are one tap away.

## One row of action icons (Steve, 2026-10-29)

Every design shows the six actions (Praying Now, Commit to Pray, Encourage, Well Wishes, Share, Gift Tokens) as one row of icons (`components/post-card.tsx`). Each icon's name shows in a tip on mouse hover (web, iPad pointer, Mac) or a long press, and is its accessibility label for VoiceOver. A committed request shows its Commit icon highlighted, and the tip says "Committed". Touch targets are 44 pt.

## Comment trees

`apps/mobile/src/components/comment-tree.tsx`. On a vine skin the comments on a request read top to bottom, present to past: the newest comment is the top leaf, each comment sits inside a pointed leaf on the same drawn vine, alternating sides, and replies hang below their comment on the same side on smaller leaves (to the third level). The older comments past the first few fade into the blur until tapped. New leaves grow in with a short spring, and tapping the blur brings the older leaves forward. Both animations stay off for anyone whose device asks for reduced motion. A shared comment link opens the branches that hold it. Stars mark the leaves on Neon Cinderella and flowers on Blossom Garden. On the tower, comments stay stone tablets and smaller sub-tablets.

## Theme maker (members make their own skins)

The maker's live preview redraws as each choice changes, including the **Drawing style** (swaying stem, twisting beanstalk, pen and ink, climbing rose, lines of light, neon tubes). Sending a skin asks an admin to approve it (in Admin → Feed skins). Once approved it appears in the Skin gallery for everyone, with likes and "Use this skin"; the maker can use it at once.

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

- Moonlit Gate's gate and the tower's stonework and climber are our own drawings (`components/gate-arch.tsx`, `components/stone-tablet.tsx`). The gate is inspired by old moonlit-door drawings in general and copies no published illustration; it has no inscription, emblems or names from any book.
- Beanstalk and Golden Wood are our own drawings in a general fairy-tale and pen-and-ink style. They copy no Disney or Tolkien artwork, and app text uses no Tolkien names.

The skins use our own names (Golden Wood, Moonlit Gate). Middle-earth Enterprises holds many Tolkien trademarks ([Justia listing](https://trademarks.justia.com/owners/middle-earth-enterprises-llc-5365969)), so Tolkien's place names stay out of the app and store text until legal checks them. The skins are only inspired by golden woods and moonlit stone gates.

Neon Cinderella's drawings (castle, pumpkin coach, glass slipper) are our own simple line drawings built from shapes in `apps/mobile/src/layouts/motifs.tsx`, not traced or copied from any film or park. The Cinderella story itself is an old folk tale (Perrault's 1697 version; see [Britannica Kids](https://kids.britannica.com/students/article/Cinderella/319708) and [The Legal Guide](https://thelegalguide.org/is-cinderella-story-public-domain/)), but a studio's own designs and characters are not. Keep the skin's name and art generic, and have legal check before any store text names Cinderella.
