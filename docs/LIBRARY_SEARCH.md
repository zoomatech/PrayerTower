# Search the texts (Bible and ancient writings)

Ported from Winstons Syndicate (Steve, 2026-10-29: "the bible search feature FROM winston's syndicate needs to be added here"; it will grow to search other ancient texts). Off by default: Admin → Text search.

## What members get

Me → **Search the texts**. Type words; passages come back best first. Faith communities choose the **King James Bible**, **Ancient writings** or **Oldest texts**; Open Circle gets the last two only (the server refuses the Bible there).

The native Swift app adds two Bible searches on the phone (`apps/ios-native/Sources/PrayerTowerScripture`): **Who did what** (Winstons Syndicate's relationship search, "David slew Goliath", Apple NaturalLanguage) and **A story I remember** (its six-verse fuzzy search, with Apple's built-in sentence embedding in place of the ONNX EmbeddingGemma download).

## How the search works

`apps/server/src/modules/library/search.ts` is a line-for-line port of `VerseLibrary.passageSearch` and `PassageWords` in Winstons Syndicate (`Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift`):

- A passage is a verse (or paragraph) plus the one either side of it in the same book or work.
- Words are compared by stem: endings come off (`loveth`, `loved`, `love` are one word) and the KJV's own forms count as the word (`thee/ye/you`, `saith/says`, `who/whom`, irregular verbs).
- Synonyms from the public-domain Moby Thesaurus count for 0.8 of the word (`rod` = `staff`), except for very common words.
- Rarer words weigh more (log of total passages over passages holding the word). Ranking: every word present, then every word or a synonym, then weight, then words in the order typed, then the verse's own weight. Neighbouring hits are collapsed to one.

The relationship and fuzzy searches need Apple frameworks, so they live in the native app only (above), not on the server or in the Expo app.

## Texts and rights

`apps/server/data/library/` (gzipped JSON, shipped in the server image):

| File | What | Source |
| --- | --- | --- |
| `bible-kjv.json.gz` | KJV, 31,102 verses | Project Gutenberg eBook #10 (public domain in the US) |
| `ancient-writings.json.gz` | 8 public-domain works, 2,813 passages: Old Babylonian Gilgamesh (Jastrow & Clay), Babylonian and Assyrian Literature, Literature of the Ancient Egyptians, Assyrian and Hebrew Hymns of Praise, Egyptian Tales, hieroglyphical literature, Marcus Aurelius (two translations) | Project Gutenberg editions via Winstons Syndicate's `AncientWritings.corpus` |
| `oldest-texts.json.gz` | 7 works, 1,679 passages: Ptah-hotep (Gunn 1906), Breasted's Ancient Records of Egypt I (Palermo Stone, Metjen, Weni; 1906), Allen's Horus in the Pyramid Texts (1916), Barton's Royal Inscriptions of Sumer and Akkad (Urukagina; 1929), Langdon's Sumerian Liturgies and Psalms (early Lament for Ur, Kes liturgy; 1919), Hammurabi (Harper 1904), Atrahasis (Clay 1922) | Built by `python3 scripts/library-sources.py` from `sources/` (raw texts and their URLs in `sources/README.md`). The archive.org books are OCR, so the script drops page furniture and transliteration; some scanning errors remain |
| `kjv-synonyms.txt.gz` | Synonym table | Moby Thesaurus (public domain) |

Only works marked `public_domain` are loaded. Winstons Syndicate's "Ancient Texts Predating Gilgamesh & The Bible" note is marked `unverified` there and is left out.

## Adding a text

1. Make `apps/server/data/library/<id>.json.gz`: `{ "format_version": 1, "id", "title", "faith", "source", "works": [{ "id", "title", "author", "rights": "public_domain" }], "passages": [{ "workId", "ref", "text" }] }`, passages in reading order.
2. Add `<id>` to `COLLECTIONS` and `TITLES` in `apps/server/src/modules/library/index.ts`.
3. Faith-only collections (`faith: true`, like the Bible) must also be filtered in `offered()`.

## Oldest-list texts with no public-domain translation

From `/mnt/project-files/reports/oldest-ancient-texts.md`. US public domain means published before 1931; these were first translated later, so only modern (copyrighted) translations exist, such as the Oxford ETCSL, which needs permission:

- Instructions of Shuruppak (1960s), Kesh Temple Hymn (modern; Langdon's 1919 Kes liturgy is a partial early reading), Enheduanna's hymns (1968), Code of Ur-Nammu (1952), Code of Lipit-Ishtar (1948), Laws of Eshnunna (1948), the Sumerian Gilgamesh poems, Inanna's Descent and the debate poems in full.
- Pyramid Texts and Coffin Texts in full (Mercer 1952, Faulkner 1969); Allen 1916 translates many Pyramid Text passages.
- The Stele of the Vultures is in Barton 1929 with Urukagina.
