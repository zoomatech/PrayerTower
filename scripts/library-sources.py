#!/usr/bin/env python3
"""Builds the oldest-texts, world-classics and apocrypha-kjv collections in apps/server/data/library/
from the public-domain translations in apps/server/data/library/sources/ (docs/LIBRARY_SEARCH.md).
Run from the repo root:

    python3 scripts/library-sources.py

The archive.org files are OCR, so paragraphs that are mostly page furniture, numbers or cuneiform
transliteration (ka-as-pa-am) are dropped, broken lines are joined, and doubled spaces closed up.
A short title-like line above a paragraph becomes its heading."""
import gzip
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'apps/server/data/library/sources'
OUT = ROOT / 'apps/server/data/library'

WORKS = [
    ('ptahhotep-gunn', 'The Instruction of Ptah-hotep and the Instruction of Ke\'gemni', 'Battiscombe G. Gunn (1906)', 'ptahhotep-kegemni-gunn-1906.txt'),
    ('breasted-records-1', 'Ancient Records of Egypt, Vol. I (Palermo Stone, Metjen, Weni)', 'James Henry Breasted (1906)', 'breasted-ancient-records-egypt-v1-1906.txt'),
    ('allen-horus-pyramid-texts', 'Horus in the Pyramid Texts', 'Thomas George Allen (1916)', 'allen-horus-in-pyramid-texts-1916.txt'),
    ('barton-royal-inscriptions', 'The Royal Inscriptions of Sumer and Akkad (Urukagina\'s reforms)', 'George A. Barton (1929)', 'barton-royal-inscriptions-sumer-akkad-1929.txt'),
    ('langdon-liturgies', 'Sumerian Liturgies and Psalms (Lament for Ur, Kes liturgy)', 'Stephen Langdon (1919)', 'langdon-sumerian-liturgies-psalms-1919.txt'),
    ('hammurabi-harper', 'The Code of Hammurabi', 'Robert Francis Harper (1904)', 'hammurabi-harper-1904.txt'),
    ('clay-deluge', 'A Hebrew Deluge Story in Cuneiform (Atrahasis)', 'Albert T. Clay (1922)', 'clay-hebrew-deluge-story-1922.txt'),
    ('book-of-the-dead-budge', 'The Book of the Dead (introduction and extracts)', 'E. A. Wallis Budge (1920)', 'book-of-the-dead-budge-1920.txt'),
    ('enuma-elish-budge', 'The Babylonian Legends of the Creation (Enuma Elish)', 'E. A. Wallis Budge (1921)', 'babylonian-creation-enuma-elish-budge-1921.txt'),
]

CLASSICS = [
    ('tao-te-ching-legge', 'Tao Te Ching', 'James Legge (1891)', 'tao-te-ching-legge-1891.txt'),
    ('analects-legge', 'The Analects of Confucius', 'James Legge (1893)', 'analects-legge-1893.txt'),
    ('dhammapada-muller', 'The Dhammapada', 'F. Max Müller (1881)', 'dhammapada-muller-1881.txt'),
    ('bhagavad-gita-arnold', 'The Bhagavad Gita (The Song Celestial)', 'Edwin Arnold (1885)', 'bhagavad-gita-arnold-1885.txt'),
    ('hesiod-evelyn-white', 'Hesiod, the Homeric Hymns and Homerica', 'Hugh G. Evelyn-White (1914)', 'hesiod-homeric-hymns-evelyn-white-1914.txt'),
    ('iliad-butler', 'The Iliad', 'Samuel Butler (1898)', 'iliad-butler-1898.txt'),
    ('odyssey-butler', 'The Odyssey', 'Samuel Butler (1900)', 'odyssey-butler-1900.txt'),
]


def body(text: str) -> str:
    """The book without Project Gutenberg's header and licence."""
    start = re.search(r'\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n', text)
    end = re.search(r'\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG', text)
    if start:
        text = text[start.end():]
        if end:
            text = text[: text.find(end.group(0))] if end.group(0) in text else text
    return text


def heading(line: str) -> bool:
    # Plain words only: page headers carry page numbers and OCR debris.
    words = re.findall(r'[A-Za-z]+', line)
    return 2 <= len(words) <= 12 and len(line) <= 80 and bool(re.fullmatch(r"[A-Z][A-Za-z ,'’:()\-]+", line.strip(' .'))) \
        and not line.rstrip().endswith((',', ';'))


def readable(p: str) -> bool:
    if len(p) < 80 or 'Google' in p or 'Gutenberg' in p:
        return False
    # Footnotes and editorial notes.
    if re.match(r'^\W*(\[\d|\d+\s|[*^†‘°])', p):
        return False
    letters = sum(c.isalpha() for c in p)
    if letters / len(p) < 0.75:
        return False
    tokens = p.split()
    hyphenated = sum(1 for t in tokens if re.fullmatch(r"[\w']+(-[\w']+){1,}", t) and not re.fullmatch(r'[A-Za-z]+-[A-Za-z]+', t) or t.count('-') >= 2)
    if hyphenated / max(len(tokens), 1) > 0.12:
        return False
    common = sum(1 for t in tokens if t.lower().strip('.,;:()') in {'the', 'and', 'of', 'to', 'he', 'his', 'in', 'a', 'is', 'shall', 'that', 'thou', 'not'})
    return common / max(len(tokens), 1) > 0.08


def passages(work_id: str, text: str):
    text = body(text).replace('\r', '')
    blocks = re.split(r'\n\s*\n', text)
    out, current = [], ''
    for block in blocks:
        lines = [re.sub(r'[ \t]+', ' ', l).strip() for l in block.split('\n')]
        lines = [l for l in lines if l]
        if not lines:
            continue
        if work_id == 'hammurabi-harper' and len(lines) == 1:
            number = re.fullmatch(r'[S§iI]\W?\s*(\d{1,3})\s*\.?', lines[0])
            if number:
                current = f'§ {number.group(1)}'
                continue
        if len(lines) == 1 and heading(lines[0]):
            current = lines[0].strip(' .:')
            continue
        joined = ''
        for l in lines:
            if joined.endswith('-') and not joined.endswith(' -'):
                joined = joined[:-1] + l
            else:
                joined = (joined + ' ' + l).strip()
        # Hammurabi's sections: "§ 182. C If a father ..." (OCR may read § as S or i^).
        section = re.match(r'^\W{0,3}[iS§]?\^?\s*(\d{1,3})\.\s*C?\s+(?=[A-Z])', joined) if work_id == 'hammurabi-harper' else None
        if section:
            joined = joined[section.end():]
        joined = re.sub(r'^[CS§]\s+(?=[A-Z])', '', joined)
        if readable(joined):
            ref = f'§ {section.group(1)}' if section else (current or f'Passage {len(out) + 1}')
            out.append({'workId': work_id, 'ref': ref, 'text': joined[:4000]})
    return out


def verses(text: str):
    """The King James Apocrypha: a book title line ("The Book of Tobit"), then "1:1 And ..." verses (or "1 And ..."
    in the short additions, or plain paragraphs in the Prayer of Manasses), one book a work."""
    works, out, book, para = [], [], None, 0
    for block in re.split(r'\n\s*\n', body(text).replace('\r', '')):
        lines = [l.strip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        first = lines[0]
        if len(lines) <= 2 and first.startswith('The ') and len(first) <= 70 and not first.endswith(('.', ',', ';', ':')):
            title = ' '.join(l for l in lines if not l.startswith('['))
            title = re.sub(r'\s+', ' ', re.sub(r'\s*(\(or [^)]*\)|\[[^\]]*\])', '', title)).strip()
            book = {'id': 'apocrypha-' + re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:60], 'title': title, 'author': '', 'rights': 'public_domain'}
            para = 0
            if all(w['id'] != book['id'] for w in works):
                works.append(book)
            continue
        if not book or first.startswith(('[', '_')):
            continue
        line = ' '.join(lines)
        m = re.match(r'^(\d+)(?::(\d+))?\s+(.*)', line)
        if m:
            ref = f"{book['title']} {m.group(1)}:{m.group(2)}" if m.group(2) else f"{book['title']} {m.group(1)}"
            out.append({'workId': book['id'], 'ref': ref, 'text': m.group(3)})
        elif len(line) > 60 and not re.match(r'^(CHAPTER|Chapter)\b', line):
            para += 1
            out.append({'workId': book['id'], 'ref': book['title'], 'text': line})
    used = {p['workId'] for p in out}
    return [w for w in works if w['id'] in used], out


def write(out_id: str, title: str, faith: bool, source: str, works, all_passages):
    data = {'format_version': 1, 'id': out_id, 'title': title, 'faith': faith, 'source': source, 'works': works, 'passages': all_passages}
    path = OUT / f'{out_id}.json.gz'
    with gzip.GzipFile(path, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode())
    print(f'{len(all_passages)} passages -> {path.relative_to(ROOT)}')


def build(out_id: str, title: str, list_):
    works, all_passages = [], []
    for work_id, work_title, author, file in list_:
        found = passages(work_id, (SRC / file).read_text(encoding='utf-8', errors='replace'))
        works.append({'id': work_id, 'title': work_title, 'author': author, 'rights': 'public_domain'})
        all_passages += found
        print(f'{work_id}: {len(found)} passages')
    write(out_id, title, False, 'Public-domain translations (before 1931) from Project Gutenberg and archive.org; see data/library/sources/README.md', works, all_passages)


def main():
    build('oldest-texts', 'Oldest texts', WORKS)
    build('world-classics', 'World classics', CLASSICS)
    works, found = verses((SRC / 'apocrypha-kjv.txt').read_text(encoding='utf-8'))
    print(f'apocrypha: {len(works)} books')
    write('apocrypha-kjv', 'King James Apocrypha', True, 'Project Gutenberg eBook #124 (King James Version, public domain)', works, found)


if __name__ == '__main__':
    main()
