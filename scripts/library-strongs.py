#!/usr/bin/env python3
"""Builds word study for Text search (docs/LIBRARY_SEARCH.md) from public-domain sources in
apps/server/data/library/sources/:

- kjv-strongs/*.usfm: the King James Version with Strong's numbers (eBible.org eng-kjv2006, "Public Domain")
  -> data/library/kjv-strongs.json.gz: each verse of bible-kjv as words, a tagged word carrying its numbers.
- strongs/StrongHebrewG.xml and strongs/strongsgreek.xml: Strong's Hebrew (1894) and Greek (1890) dictionaries
  -> data/library/strongs-dictionary.json.gz: each number's word, transliteration, pronunciation, derivation,
  Strong's own definition and the King James renderings. Only Strong's parts are taken.

Run from the repo root:  python3 scripts/library-strongs.py"""
import gzip
import json
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIB = ROOT / 'apps/server/data/library'
SRC = LIB / 'sources'


def norm(n: str) -> str:
    """H0430 and H430 are one number: no leading zeros."""
    return n[0] + str(int(n[1:]))


def write(name: str, data):
    with gzip.GzipFile(LIB / name, 'wb', mtime=0, compresslevel=9) as f:
        # NFC, so the Greek and Hebrew compare equal to what a keyboard types.
        f.write(unicodedata.normalize('NFC', json.dumps(data, ensure_ascii=False, separators=(',', ':'))).encode())
    print(f'{name}: {(LIB / name).stat().st_size // 1024} KB')


WORD = re.compile(r'\\\+?w ([^|\\]*)\|strong="([^"]+)"\\\+?w\*')


def verse_tokens(text: str):
    """USFM verse text -> ["In the ", ["beginning", ["H7225"]], " ", ...]: plain text and tagged words."""
    text = re.sub(r'\\f .*?\\f\*', '', text)  # footnotes
    text = text.replace('¶', '')  # paragraph marks
    # Character styles keep their words: "\\add be\\add*" is "be". The space after an opening marker is the marker's own.
    text = re.sub(r'\\\+?(add|nd|wj|qt|tl|sc|it) ', '', text)
    text = re.sub(r'\\\+?(add|nd|wj|qt|tl|sc|it)\*', '', text)
    out, at = [], 0
    for m in WORD.finditer(text):
        if m.start() > at:
            out.append(text[at:m.start()])
        out.append([m.group(1), [norm(s) for s in m.group(2).split(',') if re.fullmatch(r'[HG]\d+', s)]])
        at = m.end()
    if at < len(text):
        out.append(text[at:])
    # Tidy spaces left by removed markers.
    tidy = []
    for t in out:
        if isinstance(t, str):
            t = re.sub(r'\s+', ' ', t)
            if tidy and isinstance(tidy[-1], str):
                tidy[-1] += t
                continue
        tidy.append(t)
    if tidy and isinstance(tidy[0], str):
        tidy[0] = tidy[0].lstrip()
    if tidy and isinstance(tidy[-1], str):
        tidy[-1] = tidy[-1].rstrip()
    return [t for t in tidy if t != '']


def bible():
    kjv = json.load(gzip.open(LIB / 'bible-kjv.json.gz'))
    titles = [w['title'] for w in kjv['works']]
    files = sorted((SRC / 'kjv-strongs').glob('*.usfm'))
    assert len(files) == len(titles) == 66, (len(files), len(titles))
    verses = {}
    for title, file in zip(titles, files):
        chapter = 0
        current = None
        for line in file.read_text(encoding='utf-8').split('\n'):
            c = re.match(r'\\c (\d+)', line)
            if c:
                chapter = int(c.group(1))
                current = None
                continue
            v = re.match(r'\\v (\d+) (.*)', line)
            if v:
                current = f'{title} {chapter}:{v.group(1)}'
                verses[current] = v.group(2)
            elif current and line.strip() and not line.startswith(('\\c', '\\s', '\\ms', '\\d ', '\\id', '\\h', '\\toc', '\\mt')):
                verses[current] += ' ' + re.sub(r'^\\(p|q\d?|m|pi\d?|li\d?|b|nb)\s*', '', line)
    refs = [p['ref'] for p in kjv['passages']]
    missing = [r for r in refs if r not in verses]
    print(f'{len(verses)} tagged verses; {len(missing)} KJV verses without tags', missing[:5])
    write('kjv-strongs.json.gz', {
        'format_version': 1,
        'source': "King James Version with Strong's numbers, eBible.org eng-kjv2006 (Public Domain)",
        'refs': refs,
        'verses': [verse_tokens(verses.get(r, '')) for r in refs],
    })


def text(el) -> str:
    """An element's words, with <w> cross-references written as their number."""
    if el is None:
        return ''
    parts = [el.text or '']
    for child in el:
        tag = child.tag.split('}')[-1]
        if tag == 'w' and child.get('src'):
            parts.append(f"H{child.get('src')} ({child.get('lemma', '')})")
        elif tag == 'strongsref':
            lang = 'H' if child.get('language') == 'HEBREW' else 'G'
            parts.append(f"{lang}{int(child.get('strongs'))}")
        else:
            parts.append(text(child))
        parts.append(child.tail or '')
    return re.sub(r'\s+', ' ', ''.join(parts)).strip()


def dictionary():
    entries = {}
    ns = {'o': 'http://www.bibletechnologies.net/2003/OSIS/namespace'}
    heb = ET.parse(SRC / 'strongs/StrongHebrewG.xml').getroot()
    for div in heb.iter('{http://www.bibletechnologies.net/2003/OSIS/namespace}div'):
        if div.get('type') != 'entry':
            continue
        w = div.find('o:w', ns)
        notes = {n.get('type'): text(n) for n in div.findall('o:note', ns)}
        n = f"H{int(div.get('n'))}"
        entries[n] = {
            'lemma': w.get('lemma', ''), 'translit': w.get('xlit', ''), 'pron': w.get('POS', ''),
            'derivation': notes.get('exegesis', ''), 'definition': notes.get('explanation', ''),
            'kjv': notes.get('translation', ''),
        }
    grk = ET.parse(SRC / 'strongs/strongsgreek.xml').getroot()
    for e in grk.iter('entry'):
        g = e.find('greek')
        pron = e.find('pronunciation')
        n = f"G{int(e.get('strongs'))}"
        entries[n] = {
            'lemma': g.get('unicode', '') if g is not None else '', 'translit': g.get('translit', '') if g is not None else '',
            'pron': pron.get('strongs', '') if pron is not None else '',
            'derivation': text(e.find('strongs_derivation')), 'definition': text(e.find('strongs_def')),
            'kjv': re.sub(r'^:--', '', text(e.find('kjv_def'))),
        }
    print(f"{sum(k[0] == 'H' for k in entries)} Hebrew, {sum(k[0] == 'G' for k in entries)} Greek entries")
    write('strongs-dictionary.json.gz', {
        'format_version': 1,
        'source': "Strong's Hebrew (1894) and Greek (1890) dictionaries, public domain (Open Scriptures XML)",
        'entries': entries,
    })


if __name__ == '__main__':
    bible()
    dictionary()
