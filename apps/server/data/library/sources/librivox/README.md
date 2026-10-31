# LibriVox catalogue data

Raw JSON from the LibriVox API (`extended=1`: sections with `listen_url`, readers, and the archive.org URL), saved unchanged, fetched 2026-10-29.
LibriVox recordings are in the public domain: https://librivox.org/pages/public-domain/

The API's `title` matches a whole title exactly; a leading `^` (`%5E`) matches titles that start with it. Most queries use `^` to catch every version.

| File | What it holds | URL fetched |
| --- | --- | --- |
| `bible-kjv-1.json` | every LibriVox project whose title starts "Bible (KJV)" (73; fewer than 200, so one page) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EBible%20(KJV)&limit=200&offset=0 |
| `apocrypha-kjv.json` | the King James Apocrypha/Deuterocanon projects | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EBible%20(KJV)%20Apocrypha |
| `apocrypha.json` | titles starting "Apocrypha" (other apocrypha, not the KJV books) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EApocrypha |
| `tao-te-ching.json` | Tao Teh King (LibriVox spells it this way) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5ETao%20Te |
| `analects.json` | Analects of Confucius | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EAnalects |
| `dhammapada.json` | Dhammapada, three versions | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EDhammapada |
| `gita-song-celestial.json` | Song Celestial (Arnold) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5ESong%20Celestial |
| `gita-bhagavad.json` | Bhagavad Gita (one English, one German) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EBhagavad |
| `iliad.json` | titles starting "Iliad" (several translations) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EIliad |
| `odyssey.json` | titles starting "Odyssey" (several versions) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EOdyssey |
| `meditations.json` | titles starting "Meditations" (Marcus Aurelius among others, e.g. Descartes) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EMeditations |
| `hesiod.json` | Works and Days, The Theogony, and The Shield of Heracles (title search "Hesiod" finds nothing) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EWorks%20and%20Days |
| `homeric-hymns.json` | Homeric Hymns, Epigrams, and The Battle of Frogs and Mice | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EHomeric%20Hymns |
| `gilgamesh.json` | Budge, The Babylonian Story of the Deluge and the Epic of Gilgamesh (title search "Gilgamesh" finds nothing) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EBabylonian |
| `book-of-the-dead.json` | Book of the Dead (Budge) | https://librivox.org/api/feed/audiobooks/?format=json&extended=1&title=%5EBook%20of%20the%20Dead |

Not found: "Babylonian Legends of the Creation" (and Seven Tablets / Enuma Elish) has no LibriVox recording, so there is no `creation.json`.
