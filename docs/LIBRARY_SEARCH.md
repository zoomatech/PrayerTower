# Search the texts (Bible and ancient writings)

Ported from Winstons Syndicate (Steve, 2026-10-29: "the bible search feature FROM winston's syndicate needs to be added here"; it will grow to search other ancient texts). Off by default: Admin → Text search.

## What members get

Me → **Search the texts**. Type words; passages come back best first. Faith communities choose the **King James Bible**, **King James Apocrypha**, **Ancient writings**, **Oldest texts** or **World classics**; Open Circle gets the last three only (the server refuses the Bible and the Apocrypha there).

### Share a passage and the daily passage (both off by default)

Admin → Text search has two more switches, shown once search is on (`library_settings.share_enabled`, `daily_enabled`; features `libraryShare`, `libraryDaily`, each true only while search is on too):

- **Share a passage**: each search result gets a **Share** button. It opens a new post (prayer request by default; the member can switch to praise and edit the words) holding the passage in quotes and its citation:

  ```
  “The LORD is my shepherd; I shall not want.”
  — Psalms 23:1 (King James Bible)
  ```

  Citations: a Bible or Apocrypha reference plus `(King James Bible)` / `(King James Apocrypha)`; any other text is `Work title, place (translator and year)`, such as `The Iliad, BOOK I (Samuel Butler (1898))`.
- **Daily passage card**: at the top of the feed (All), a passage of 60 to 320 characters, the same all day for everyone in the community (picked by a hash of the UTC date): the King James Bible in faith communities, the ancient writings in Open Circle. **Not now** hides it for the day. It has **Share** when sharing is on. `GET /library/daily`.

Both are in the Expo app (`src/components/daily-passage.tsx`, `src/app/library.tsx`) and the native app (`App/LibraryView.swift`: `DailyPassageCard`, the Share button, `LibraryAdminSection`).

Winstons Syndicate's scripture package (relationship search, "David slew Goliath", and fuzzy remembered-story search) is still being built there. It will come to Prayer Tower later as an **Ask the Bible** feature (Steve, 2026-10-29), so it is not ported here.

## How the search works

`apps/server/src/modules/library/search.ts` is a line-for-line port of `VerseLibrary.passageSearch` and `PassageWords` in Winstons Syndicate (`Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift`):

- A passage is a verse (or paragraph) plus the one either side of it in the same book or work.
- Words are compared by stem: endings come off (`loveth`, `loved`, `love` are one word) and the KJV's own forms count as the word (`thee/ye/you`, `saith/says`, `who/whom`, irregular verbs).
- Synonyms from the public-domain Moby Thesaurus count for 0.8 of the word (`rod` = `staff`), except for very common words.
- Rarer words weigh more (log of total passages over passages holding the word). Ranking: every word present, then every word or a synonym, then weight, then words in the order typed, then the verse's own weight. Neighbouring hits are collapsed to one.

The relationship and fuzzy searches stay in Winstons Syndicate until Ask the Bible (above).

## Texts and rights

`apps/server/data/library/` (gzipped JSON, shipped in the server image):

| File | What | Source |
| --- | --- | --- |
| `bible-kjv.json.gz` | KJV, 31,102 verses | Project Gutenberg eBook #10 (public domain in the US) |
| `ancient-writings.json.gz` | 8 public-domain works, 2,813 passages: Old Babylonian Gilgamesh (Jastrow & Clay), Babylonian and Assyrian Literature, Literature of the Ancient Egyptians, Assyrian and Hebrew Hymns of Praise, Egyptian Tales, hieroglyphical literature, Marcus Aurelius (two translations) | Project Gutenberg editions via Winstons Syndicate's `AncientWritings.corpus` |
| `oldest-texts.json.gz` | Ptah-hotep and the rest: Ptah-hotep (Gunn 1906), Breasted's Ancient Records of Egypt I (Palermo Stone, Metjen, Weni; 1906), Allen's Horus in the Pyramid Texts (1916), Barton's Royal Inscriptions of Sumer and Akkad (Urukagina; 1929), Langdon's Sumerian Liturgies and Psalms (early Lament for Ur, Kes liturgy; 1919), Hammurabi (Harper 1904), Atrahasis (Clay 1922); and since 2026-10-29 the Book of the Dead (Budge 1920, introduction and extracts, Gutenberg #7145) and Enuma Elish (Budge, *The Babylonian Legends of the Creation*, 1921, Gutenberg #9914). 9 works, 1,809 passages | Built by `python3 scripts/library-sources.py` from `sources/` (raw texts and their URLs in `sources/README.md`). The archive.org books are OCR, so the script drops page furniture and transliteration; some scanning errors remain |
| `apocrypha-kjv.json.gz` | The 15 books of the King James Apocrypha, 5,709 verses: 1 and 2 Esdras, Tobit, Judith, the Greek additions to Esther, Wisdom, Sirach, Baruch, the Epistle of Jeremiah, the Song of the Three Holy Children, Susanna, Bel and the Dragon, the Prayer of Manasses, 1 and 2 Maccabees. Faith communities only | Project Gutenberg eBook #124, <https://www.gutenberg.org/ebooks/124> (KJV 1611, public domain) |
| `world-classics.json.gz` | 7 works, 3,722 passages: Tao Te Ching (James Legge, 1891), the Analects (Legge, 1893), the Dhammapada (F. Max Müller, 1881), the Bhagavad Gita, *The Song Celestial* (Edwin Arnold, 1885), Hesiod, the Homeric Hymns and Homerica (Hugh G. Evelyn-White, Loeb 1914), the Iliad (Samuel Butler, 1898), the Odyssey (Butler, 1900) | Project Gutenberg eBooks #216, #3330, #2017, #2388, #348, #2199, #1727 (all published before 1931) |
| `kjv-synonyms.txt.gz` | Synonym table | Moby Thesaurus (public domain) |

Only works marked `public_domain` are loaded. Winstons Syndicate's "Ancient Texts Predating Gilgamesh & The Bible" note is marked `unverified` there and is left out.

Caveats on the 2026-10-29 additions:

- **Book of the Dead**: Gutenberg #7145 is Budge's 1920 popular edition: his introduction and extracts, not the full Papyrus of Ani. The full 1895 Papyrus of Ani is on archive.org as page scans; it can be added later the same way as the OCR books.
- **Enuma Elish**: L. W. King's *Seven Tablets of Creation* (1902) is not on Project Gutenberg, so Budge's 1921 British Museum translation is used. King's edition is on archive.org (OCR) if wanted.
- All ten files were downloaded on the Mac (the cloud can't reach Project Gutenberg); their URLs are in `sources/README.md`.

## Adding a text

1. Make `apps/server/data/library/<id>.json.gz`: `{ "format_version": 1, "id", "title", "faith", "source", "works": [{ "id", "title", "author", "rights": "public_domain" }], "passages": [{ "workId", "ref", "text" }] }`, passages in reading order.
2. Add `<id>` to `COLLECTIONS` and `TITLES` in `apps/server/src/modules/library/index.ts`.
3. Faith-only collections (`faith: true`, like the Bible and the Apocrypha) are left out of Open Circle by `offered()`.
4. Add the id to `LibraryCollectionId` in `apps/mobile/src/lib/api.ts`.

## Oldest-list texts with no public-domain translation

From `/mnt/project-files/reports/oldest-ancient-texts.md`. US public domain means published before 1931; these were first translated later, so only modern (copyrighted) translations exist, such as the Oxford ETCSL, which needs permission:

- Instructions of Shuruppak (1960s), Kesh Temple Hymn (modern; Langdon's 1919 Kes liturgy is a partial early reading), Enheduanna's hymns (1968), Code of Ur-Nammu (1952), Code of Lipit-Ishtar (1948), Laws of Eshnunna (1948), the Sumerian Gilgamesh poems, Inanna's Descent and the debate poems in full.
- Pyramid Texts and Coffin Texts in full (Mercer 1952, Faulkner 1969); Allen 1916 translates many Pyramid Text passages.
- The Stele of the Vultures is in Barton 1929 with Urukagina.
