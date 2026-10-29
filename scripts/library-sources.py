#!/usr/bin/env python3
"""Builds apps/server/data/library/oldest-texts.json.gz from the public-domain translations in
apps/server/data/library/sources/ (docs/LIBRARY_SEARCH.md). Run from the repo root:

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
OUT = ROOT / 'apps/server/data/library/oldest-texts.json.gz'

WORKS = [
    ('ptahhotep-gunn', 'The Instruction of Ptah-hotep and the Instruction of Ke\'gemni', 'Battiscombe G. Gunn (1906)', 'ptahhotep-kegemni-gunn-1906.txt'),
    ('breasted-records-1', 'Ancient Records of Egypt, Vol. I (Palermo Stone, Metjen, Weni)', 'James Henry Breasted (1906)', 'breasted-ancient-records-egypt-v1-1906.txt'),
    ('allen-horus-pyramid-texts', 'Horus in the Pyramid Texts', 'Thomas George Allen (1916)', 'allen-horus-in-pyramid-texts-1916.txt'),
    ('barton-royal-inscriptions', 'The Royal Inscriptions of Sumer and Akkad (Urukagina\'s reforms)', 'George A. Barton (1929)', 'barton-royal-inscriptions-sumer-akkad-1929.txt'),
    ('langdon-liturgies', 'Sumerian Liturgies and Psalms (Lament for Ur, Kes liturgy)', 'Stephen Langdon (1919)', 'langdon-sumerian-liturgies-psalms-1919.txt'),
    ('hammurabi-harper', 'The Code of Hammurabi', 'Robert Francis Harper (1904)', 'hammurabi-harper-1904.txt'),
    ('clay-deluge', 'A Hebrew Deluge Story in Cuneiform (Atrahasis)', 'Albert T. Clay (1922)', 'clay-hebrew-deluge-story-1922.txt'),
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


def main():
    works, all_passages = [], []
    for work_id, title, author, file in WORKS:
        found = passages(work_id, (SRC / file).read_text(encoding='utf-8', errors='replace'))
        works.append({'id': work_id, 'title': title, 'author': author, 'rights': 'public_domain'})
        all_passages += found
        print(f'{work_id}: {len(found)} passages')
    data = {'format_version': 1, 'id': 'oldest-texts', 'title': 'Oldest texts', 'faith': False,
            'source': 'Public-domain translations (before 1931) from Project Gutenberg and archive.org; see data/library/sources/README.md',
            'works': works, 'passages': all_passages}
    with gzip.GzipFile(OUT, 'wb', mtime=0, compresslevel=9) as f:
        f.write(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode())
    print(f'{len(all_passages)} passages -> {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
