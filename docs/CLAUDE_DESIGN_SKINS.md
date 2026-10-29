# Designing a feed skin in Claude Design

How to design a new feed skin in Claude Design and drop it into Prayer Tower as a theme row. No app release is needed: a skin is one row in `feed_themes` (docs/FEED_SKINS.md).

## What Claude Design does here

Claude Design draws on a canvas, can use a design system built from a codebase, and hands finished work to Claude Code. From Anthropic's help article ([Get started with Claude Design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design), [announcement](https://www.anthropic.com/news/claude-design-anthropic-labs)):

- Start a design from a conversation or the Artifacts tab.
- `/design-sync` in Claude Code brings in a design system "from a GitHub repo, design files, raw uploads, or your local codebase".
- **Export** (top right of a project) gives .zip, PDF, PPTX, Google Slides, standalone HTML, other tools, and **Handoff to Claude Code** (local or Claude Code on the web).
- Available on Free, Pro, Max, Team and Enterprise plans.
- The standalone site at claude.ai/design closes on 14 December 2026. Move design systems into Claude before then.

There is no Claude Design API, so the app can't call it. A person designs; Claude Code turns the result into a skin file.

## Steps

1. **Give Claude Design the app's look.** In Claude Code, in this repo, run `/design-sync` so the design system comes from `apps/mobile/src/lib/theme.ts` and `apps/mobile/src/layouts/`.
2. **Design the skin.** Start a design and paste the prompt below. Refine it on the canvas until the feed, a comment branch and the emoji word leaves look right.
3. **Hand it off.** Export → Handoff to Claude Code. In that session, ask: "Turn this design into a skin file like docs/skin-template.json, then run `npm run skin:add` on it."
4. **Check and add it.** `npm run skin:add -- path/to/skin.json` checks the file (allowed tokens only, colors as #RRGGBB, comment background readable at 4.5:1) and writes a migration in `supabase/migrations/`. A bad file stops with the reason.
5. **Look at it.** `npx supabase db reset`, sign in as a demo member, turn on Admin → Feed skins → Show the new feed skins, and pick it in Me → Feed style.
6. **Ship it.** Open a pull request with the migration. It reaches the hosted database with the next deploy. The skin stays hidden until the skins switch is on, like every other skin.

## Prompt to paste into Claude Design

```
Design a feed skin for Prayer Tower, a calm, ad-free prayer app. Use the attached design system.
Theme: <describe the look, e.g. "a harvest moon over a wheat field">.
Layout: <vine (posts grow along a stem), wall (one post per screen), tower (stone tower with a climber) or circuit (posts in glowing tilted screens on a wire)>.
Show: the feed with three posts, one comment branch with three replies, and the emoji word leaves under a post.
Keep post cards white with dark text. Body text and tags must keep at least 4.5:1 contrast with the background.
When done, list the colors as #RRGGBB for: backdrop, stem, branch, leaf, leafSoft (comment background), tendril (accent text), and say which leaf shape fits: round, pointed, flower, star or tablet.
```

## The skin file

Start from [docs/skin-template.json](skin-template.json). Fields:

| Field | Meaning |
|---|---|
| `slug` | Lowercase words joined by hyphens, unique, at most 40 characters. |
| `name` | What members see in Feed style. In Open Circle skins, avoid religious words. |
| `layout` | `vine`, `wall`, `tower` or `circuit`. |
| `for` | `all`, `faith` (every community except Open Circle) or `open` (Open Circle only). |
| `season` | Optional: `advent`, `christmas`, `lent`, `easter`, `pentecost`, `winter`, `spring`, `summer` or `autumn`. The skin then shows only in that season. |
| `animations` | Optional; vine skins read `enter`, `answered` and `idleBird`. |
| `tokens` | The look. Vine: `backdrop`, `stem`, `stemWidth` (2–14), `stemDouble`, `stemGlow`, `branch`, `leaf`, `leafSoft`, `tendril`, `leafShape`, `scenery` (`fairytale` or empty), `vineStyle` (`beanstalk`, `ink`, `neon`, `gate` or empty), `ink` (outline color for `ink`), `leafEvery`, `idleBirdSeconds`, `tipText`, `birdText`. Wall: `backdrop`. Tower: `stone`, `mortar`, `backdrop`, `climber`. Circuit: `backdrop`, `wire`, `burst`, `screen`, `tilt` (0–20). |

A file can hold one skin or a list of them. The seasonal skins were added this way (`supabase/migrations/20261029031733_seasonal_skins.sql`).
