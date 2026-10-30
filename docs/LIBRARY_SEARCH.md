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

Both are in the Expo app (`src/components/daily-passage.tsx`, `src/app/library.tsx`) and the native app (`App/LibraryView.swift`: `DailyPassageCard`, the Share button, `LibraryAdminSection`). Parallels and reading plans: `src/app/parallels.tsx`, `src/app/reading-plans.tsx`; native `App/LibraryPlansView.swift`.

### Parallels (off by default)

Admin → Text search → **Parallels** (`library_settings.parallels_enabled`, feature `libraryParallels`). Me → **Parallels** lists curated themes; opening one shows its passages side by side (columns on a wide screen, a sideways row of cards on a phone), each with its collection, our short label, the translator's words and the citation. `GET /library/parallels`, `GET /library/parallels/:id`.

The themes are in `apps/server/data/library/parallels.json`. Each side names a passage by its exact reference (`ref`) or by words it holds (`find`), how many passages from there (`count`), an optional label and an optional `cite` (our own wording for the place, such as "Genesis 8:6–11" or "Tablet XI, lines 142–155"). The words shown always come from the collection, never from the file. A server test checks that every side resolves.

| Theme | Sides |
| --- | --- |
| The great flood | Genesis 6–8; Gilgamesh Tablet XI (Budge 1920): Ea's warning, the storm, the dove, swallow and raven, the sacrifice; Berossus as quoted by Clay; the Atrahasis famine fragment (Clay 1922) |
| In the beginning | Genesis 1:1–3, John 1:1–3, Enuma Elish Tablet I, Hesiod's Theogony 116–138, Tao Te Ching 1 and 42 |
| Eye for eye | Exodus 21:23–25, Leviticus 24:19–20, Hammurabi §196 and §198, Matthew 5:38–39 |
| A blow to a pregnant woman | Exodus 21:22–23, Hammurabi §209–210 |
| The goring ox | Exodus 21:28–29, Hammurabi §250 |
| A thief breaking in | Exodus 22:2–3, Hammurabi §21 |
| The golden rule | Matthew 7:12, Luke 6:31, Tobit 4:15, Analects XV.23 and XII.2 |
| Return good for evil | Matthew 5:44, Romans 12:20–21, Tao Te Ching 63, Dhammapada 5 |
| Clean hands before God | Psalm 24:3–4, Job 31:5–6, Book of the Dead chapter 125 |
| Wise, not proud | Proverbs 3:7 and 1:8, Ptah-hotep's first maxim |

Open Circle sees the themes without the Bible and the Apocrypha, and only those with passages from two different works left: the flood, creation and return good for evil.

### Reading plans (off by default)

Admin → Text search → **Reading plans** (`plans_enabled`, feature `libraryPlans`). Me → **Reading plans**. Separate from the staff-set Bible reading plan (`modules/reading-plan`, Admin → reading plan), which sends members to a Bible website.

- The plans are in `apps/server/data/library/plans.json`: **Oldest texts in 30 days** (Ptah-hotep, the Pyramid Texts and Egyptian magicians' tales from Budge, the Book of the Dead, Gilgamesh Tablet XI, Enuma Elish, Hammurabi, Egyptian tales), **Wisdom of the East in 30 days** (Tao Te Ching, Dhammapada, Analects), **The Gospels in 89 days**, **Psalms in 30 days**, **Proverbs in a month**. A part is one work, read so many Bible chapters a day or spread evenly over so many days; `from`, `to` and `until` trim front matter.
- Read in the app from the library's own texts, each day with its citation ("Psalms 16–20 (King James Bible)").
- **Own pace**: the next day is the first one not read; reading ahead is fine and nothing is ever "behind". Finishing every day marks the plan finished.
- **With a circle**: a member can start a plan with one of their prayer circles. Circle members see "Morning readers: 2 people reading" on the plan and can join; on each day they see how many in the circle have read it.
- **Gentle reminder** (on by default, a switch per plan): at most one notice in the evening (after 6 pm in the member's time zone from their daily reminder, else UTC) on a day they haven't read, kind `library_plan_reminder` (Notification settings → promises). It stops after two weeks with no reading. Hourly job `library_plan_reminders`.
- Open Circle is offered only the plans with no Bible or Apocrypha in them (the first two).
- Tables `library_plan_follows` and `library_plan_reads` (migration `20261029223000_library_parallels_plans.sql`); both are in the member's data export.

Routes: `GET /library/plans`, `PUT|DELETE /library/plans/:id/follow` (`{ circleId?, reminders? }`), `GET /library/plans/:id/days/:day`, `POST /library/plans/:id/days/:day/read`.

### Word study (off by default)

Admin → Text search → **Word study** (`words_enabled`, feature `libraryWords`). Offered only where the King James Bible is (never Open Circle).

- A **Study the words** button on each King James verse (search results, My highlights and notes) opens the verse word by word. Tagged words are buttons showing the transliterated root; tapping one opens its **Strong's number**: the Hebrew or Greek word, transliteration, pronunciation, Strong's definition and derivation, how the KJV renders it, and every verse that uses it (in Bible order, 20 at a time, each with the English words used for it there).
- Data: `kjv-strongs.json.gz` (31,102 verses as tokens: a plain string, or `[word, ["H7225"]]`) and `strongs-dictionary.json.gz` (8,674 Hebrew and 5,624 Greek entries), built by `python3 scripts/library-strongs.py` from `sources/kjv-strongs/` and `sources/strongs/`. Output is Unicode NFC. The tagged text is eBible.org's KJV 2006 edition, which spells a few words differently from the Gutenberg KJV in about 226 verses; the verse references line up exactly.
- Routes: `GET /library/words?ref=Genesis 1:1`, `GET /library/words/:id?offset&limit` (`H1`–`H8674`, `G1`–`G5624`).

### Highlights and notes (off by default)

Admin → Text search → **Highlights and notes** (`notes_enabled`, feature `libraryNotes`). Me → **My highlights and notes**.

- A **Highlight or note** button on every passage: search results in any collection, parallels, plan days. A mark is a colour (yellow, green, blue, pink), a note (up to 2,000 characters), or both; clearing both removes it. A plan day's mark is on its first passage.
- **Private by default**. A note (never a colour alone) can be shared with one of the member's prayer circles; members of that circle see it under My highlights and notes → **Shared in …**, with who wrote it. Leaving a circle hides your notes from it.
- A passage is named by its key: the first 32 hex characters of sha256(work id, reference, text), sent with every search hit and excerpt. If a collection is rebuilt and a passage's words change, its old marks keep their saved quote and citation.
- Open Circle never sees Bible or Apocrypha marks, and cannot mark them.
- Table `library_notes` (migration `20261029233000_library_words_notes_offline.sql`), in the member's data export.
- Routes: `GET /library/notes?collection`, `PUT /library/notes` (`{ collection, key, color?, note?, circleId? }`; a field left out is kept, `null` clears it), `DELETE /library/notes/:id`, `GET /library/notes/circle/:circleId`.

### Offline texts (off by default, native app)

Admin → Text search → **Offline texts** (`offline_enabled`, feature `libraryOffline`). In the iPhone, iPad and Mac app: Me → **Offline texts**, also at the top of Search the texts.

- Lists the collections the member's community is offered, with size and passage count; **Download** keeps a copy in Application Support (`OfflineTexts/`) until the member removes it. A copy whose version (a hash of the file) differs from the server's shows **Update**. A copy of a collection no longer offered is removed when the list loads.
- With no signal, Search the texts searches the downloaded copy: passages holding every word first, then at least half the words. It says so on screen, because old word forms and synonyms are not matched offline. Word study and marks need a connection.
- Routes: `GET /library/offline`, `GET /library/offline/:id` (the collection file, gzipped JSON with `Content-Encoding: gzip`).

The native Swift app adds two Bible searches on the device (`apps/ios-native/Sources/PrayerTowerScripture`, with `App/OnnxEmbedder.swift`), both ported from Winstons Syndicate, not reinvented:

- **Who did what**: its relationship search ("David slew Goliath"), reading the phrase with Apple's NaturalLanguage tagger.
- **A story I remember**: its hybrid Bible search (`HybridBibleSearch`, Winstons Syndicate PRD FR-284 to FR-287). Three searches take turns, a verse found by more than one given once, each passage giving its verse nearest the question:
  1. meaning: every chapter of five public-domain translations (KJV, ASV, BBE, BSB, YLT; scrollmapper's CSVs) split into groups of six verses every three, never crossing a chapter, each embedded by EmbeddingGemma 300M (`onnx-community/embeddinggemma-300m-ONNX`, q4, the same revision and query/document prompts, ONNX Runtime; IBM granite small r2 if Gemma cannot be had), merged across translations by reference with the best score kept;
  2. the cascade text search over the same groups (`CascadeIndex`): the whole phrase, then every essential word, then any, then every word's stem anywhere;
  3. the word search (`VerseLibrary.passageSearch`): each verse with its neighbours, the KJV's own word forms and Moby Thesaurus synonyms (rod = staff), then the relationship search.

  The translations and model (about 200 MB) are downloaded and the index made once, into Application Support/Bible Search; until that is done the word search answers alone, as in Winstons Syndicate. Winstons Syndicate's sixth translation, the NRSV, is copyrighted and is not part of Prayer Tower. Tests: Winstons Syndicate's own (`PassageTests`, `HybridTests`, `PassageWordSearchTests`, `RelationSearchTests`); on Steve's Mac with its Gemma index the hybrid answers all 22 of `TestQuestions` (meaning alone 19, cascade 12, word search 8).

## How the search works

`apps/server/src/modules/library/search.ts` is a line-for-line port of `VerseLibrary.passageSearch` and `PassageWords` in Winstons Syndicate (`Packages/SyndicateCore/Sources/ZoomaReference/VerseSearch.swift`):

- A passage is a verse (or paragraph) plus the one either side of it in the same book or work.
- Words are compared by stem: endings come off (`loveth`, `loved`, `love` are one word) and the KJV's own forms count as the word (`thee/ye/you`, `saith/says`, `who/whom`, irregular verbs).
- Synonyms from the public-domain Moby Thesaurus count for 0.8 of the word (`rod` = `staff`), except for very common words.
- Rarer words weigh more (log of total passages over passages holding the word). Ranking: every word present, then every word or a synonym, then weight, then words in the order typed, then the verse's own weight. Neighbouring hits are collapsed to one.

The relationship search, the Gemma model and the hybrid need Apple frameworks and ONNX Runtime, so they live in the native app only (above), not on the server or in the Expo app.

## Texts and rights

`apps/server/data/library/` (gzipped JSON, shipped in the server image):

| File | What | Source |
| --- | --- | --- |
| `bible-kjv.json.gz` | KJV, 31,102 verses | Project Gutenberg eBook #10 (public domain in the US) |
| `ancient-writings.json.gz` | 8 public-domain works, 2,813 passages: Old Babylonian Gilgamesh (Jastrow & Clay), Babylonian and Assyrian Literature, Literature of the Ancient Egyptians, Assyrian and Hebrew Hymns of Praise, Egyptian Tales, hieroglyphical literature, Marcus Aurelius (two translations) | Project Gutenberg editions via Winstons Syndicate's `AncientWritings.corpus` |
| `oldest-texts.json.gz` | Ptah-hotep and the rest: Ptah-hotep (Gunn 1906), Breasted's Ancient Records of Egypt I (Palermo Stone, Metjen, Weni; 1906), Allen's Horus in the Pyramid Texts (1916), Barton's Royal Inscriptions of Sumer and Akkad (Urukagina; 1929), Langdon's Sumerian Liturgies and Psalms (early Lament for Ur, Kes liturgy; 1919), Hammurabi (Harper 1904), Atrahasis (Clay 1922); and since 2026-10-29 the Book of the Dead (Budge 1920, introduction and extracts, Gutenberg #7145) and Enuma Elish (Budge, *The Babylonian Legends of the Creation*, 1921, Gutenberg #9914); and Gilgamesh Tablet XI, the flood, line by line (Budge, *The Babylonian Story of the Deluge*, 1920, Gutenberg #7096). 10 works | Built by `python3 scripts/library-sources.py` from `sources/` (raw texts and their URLs in `sources/README.md`). The archive.org books are OCR, so the script drops page furniture and transliteration; some scanning errors remain |
| `apocrypha-kjv.json.gz` | The 15 books of the King James Apocrypha, 5,709 verses: 1 and 2 Esdras, Tobit, Judith, the Greek additions to Esther, Wisdom, Sirach, Baruch, the Epistle of Jeremiah, the Song of the Three Holy Children, Susanna, Bel and the Dragon, the Prayer of Manasses, 1 and 2 Maccabees. Faith communities only | Project Gutenberg eBook #124, <https://www.gutenberg.org/ebooks/124> (KJV 1611, public domain) |
| `world-classics.json.gz` | 7 works, 3,722 passages: Tao Te Ching (James Legge, 1891), the Analects (Legge, 1893), the Dhammapada (F. Max Müller, 1881), the Bhagavad Gita, *The Song Celestial* (Edwin Arnold, 1885), Hesiod, the Homeric Hymns and Homerica (Hugh G. Evelyn-White, Loeb 1914), the Iliad (Samuel Butler, 1898), the Odyssey (Butler, 1900) | Project Gutenberg eBooks #216, #3330, #2017, #2388, #348, #2199, #1727 (all published before 1931) |
| `kjv-synonyms.txt.gz` | Synonym table | Moby Thesaurus (public domain) |
| `kjv-strongs.json.gz` | KJV with Strong's numbers on each word, 31,102 verses | eBible.org `eng-kjv2006` USFM, licence "Public Domain" (<https://ebible.org/find/details.php?id=eng-kjv2006>) |
| `strongs-dictionary.json.gz` | Strong's Hebrew (1894) and Greek (1890) dictionaries | OpenScriptures `StrongHebrewG.xml` and `strongsgreek.xml`, both marked public domain |

Only works marked `public_domain` are loaded. Winstons Syndicate's "Ancient Texts Predating Gilgamesh & The Bible" note is marked `unverified` there and is left out.

Caveats on the 2026-10-29 additions:

- **Book of the Dead**: Gutenberg #7145 is Budge's 1920 popular edition: his introduction and extracts, not the full Papyrus of Ani. The full 1895 Papyrus of Ani is on archive.org as page scans; it can be added later the same way as the OCR books.
- **Enuma Elish**: L. W. King's *Seven Tablets of Creation* (1902) is not on Project Gutenberg, so Budge's 1921 British Museum translation is used. King's edition is on archive.org (OCR) if wanted.
- **Gilgamesh Tablet XI**: Budge's 1920 translation, cited by line ("Tablet XI, lines 142–155"). R. Campbell Thompson's 1928 verse translation of the whole epic is also in `sources/` (archive.org OCR, `gilgamesh-thompson-1928.txt`) for later.
- **Hammurabi's section numbers** (fixed 2026-10-29): the scan reads § as S, ii, ij or g, and the facing transliteration's numbers run a page ahead, so sections were labelled a few numbers off. The script now takes a section only after the last one and ignores the transliteration's. A few scanning errors in passages quoted by Parallels are corrected to the printed words in `OCR_FIXES` in the script.
- **The classics' own numbering**: the Tao Te Ching by chapter, the Analects by book and chapter ("Book 15, Chapter 23"), the Dhammapada by chapter and verse, so short verses are kept and citations are exact.
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
