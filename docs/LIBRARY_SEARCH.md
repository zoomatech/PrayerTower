# Search the texts (Bible and ancient writings)

Ported from Winstons Syndicate (Steve, 2026-10-29: "the bible search feature FROM winston's syndicate needs to be added here"; it will grow to search other ancient texts). Off by default: Admin → Text search.

## What members get

Me → **Search the texts**. Type words; passages come back best first. Faith communities choose the **King James Bible** or **Ancient writings**; Open Circle gets only the ancient writings (the server refuses the Bible there).

## How the search works

`apps/server/src/modules/library/search.ts` is a line-for-line port of `VerseLibrary.passageSearch` and `PassageWords` in Winstons Syndicate (`Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift`):

- A passage is a verse (or paragraph) plus the one either side of it in the same book or work.
- Words are compared by stem: endings come off (`loveth`, `loved`, `love` are one word) and the KJV's own forms count as the word (`thee/ye/you`, `saith/says`, `who/whom`, irregular verbs).
- Synonyms from the public-domain Moby Thesaurus count for 0.8 of the word (`rod` = `staff`), except for very common words.
- Rarer words weigh more (log of total passages over passages holding the word). Ranking: every word present, then every word or a synonym, then weight, then words in the order typed, then the verse's own weight. Neighbouring hits are collapsed to one.

Not ported (they need Apple frameworks): the subject–action–object relationship search (Apple NaturalLanguage tagging) and the ONNX embedding "fuzzy" search in `Packages/ZoomaBibleSearch`. The native Swift app can use those packages directly later.

## Texts and rights

`apps/server/data/library/` (gzipped JSON, shipped in the server image):

| File | What | Source |
| --- | --- | --- |
| `bible-kjv.json.gz` | KJV, 31,102 verses | Project Gutenberg eBook #10 (public domain in the US) |
| `ancient-writings.json.gz` | 8 public-domain works, 2,813 passages: Old Babylonian Gilgamesh (Jastrow & Clay), Babylonian and Assyrian Literature, Literature of the Ancient Egyptians, Assyrian and Hebrew Hymns of Praise, Egyptian Tales, hieroglyphical literature, Marcus Aurelius (two translations) | Project Gutenberg editions via Winstons Syndicate's `AncientWritings.corpus` |
| `kjv-synonyms.txt.gz` | Synonym table | Moby Thesaurus (public domain) |

Only works marked `public_domain` are loaded. Winstons Syndicate's "Ancient Texts Predating Gilgamesh & The Bible" note is marked `unverified` there and is left out.

## Adding a text

1. Make `apps/server/data/library/<id>.json.gz`: `{ "format_version": 1, "id", "title", "faith", "source", "works": [{ "id", "title", "author", "rights": "public_domain" }], "passages": [{ "workId", "ref", "text" }] }`, passages in reading order.
2. Add `<id>` to `COLLECTIONS` and `TITLES` in `apps/server/src/modules/library/index.ts`.
3. Faith-only collections (`faith: true`, like the Bible) must also be filtered in `offered()`.

Good next candidates are public-domain translations of the oldest texts in `/mnt/project-files/reports/oldest-ancient-texts.md` (Pyramid Texts, Instructions of Shuruppak, Ptahhotep, Code of Hammurabi). Modern translations (for example ETCSL) need permission first.
