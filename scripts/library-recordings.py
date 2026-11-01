#!/usr/bin/env python3
"""Builds apps/server/data/library/recordings.json: public-domain LibriVox recordings of the library's texts,
matched to the place they read (a Bible chapter, a Tao Te Ching chapter, a book of the Iliad).

Only recordings of the same translation as the text shown are used: the King James Bible and Apocrypha,
Legge's Tao Te Ching, Muller's Dhammapada, Arnold's Song Celestial, Butler's Iliad and Odyssey, and Budge's
Babylonian Story of the Deluge (Tablet XI). Not used: LibriVox's Analects (Jennings, not Legge), its Book of the
Dead (the full Papyrus of Ani, not Budge's 1920 extracts), Meditations and Hesiod (not matched to our passages).

Input: data/library/sources/librivox/*.json (the LibriVox API's answers, downloaded on the Mac; see its README).
LibriVox recordings are in the public domain: https://librivox.org/pages/public-domain/

Run from the repo root:  python3 scripts/library-recordings.py"""
import gzip
import json
import re
from pathlib import Path

LIB = Path(__file__).resolve().parent.parent / 'apps/server/data/library'
SRC = LIB / 'sources/librivox'
ROMAN = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100}


def roman(s: str) -> int:
    total = 0
    for a, b in zip(s, s[1:] + ' '):
        v = ROMAN[a]
        total += -v if b != ' ' and ROMAN[b] > v else v
    return total


def books(name: str):
    return json.load(open(SRC / name))['books']


def section(book, s, collection, work, start, end):
    return {
        'collection': collection,
        'workId': work,
        'from': start,
        'to': end,
        'url': s['listen_url'],
        'title': s['title'] or book['title'],
        'readers': [r['display_name'] for r in s.get('readers') or []],
        'seconds': int(s.get('playtime') or 0),
        'project': re.sub(r'\s+', ' ', book['title']).strip(),
        'projectUrl': book['url_librivox'],
    }


def numbers(text: str):
    """The chapters a section title names: "Chapters 3 - 4", "Psalms 147, 148", "Chapter 01", "Ch. 1 - 14"."""
    m = re.search(r'(\d+)\s*(?:-|to|&)\s*(\d+)', text)
    if m:
        return int(m.group(1)), int(m.group(2))
    found = [int(n) for n in re.findall(r'\d+', text)]
    return (min(found), max(found)) if found else None


def bible():
    kjv = json.load(gzip.open(LIB / 'bible-kjv.json.gz'))
    work_of = {w['title']: w['id'] for w in kjv['works']}
    chapters = {}
    for p in kjv['passages']:
        m = re.match(r'^(.*) (\d+):\d+$', p['ref'])
        if m:
            chapters[m.group(1)] = max(chapters.get(m.group(1), 0), int(m.group(2)))
    names = sorted(work_of, key=len, reverse=True)
    skip = {'315', '408', '1631', '2280', '11536'}  # Psalm 133 versions, the Sermon on the Mount, front matter, Job in parts
    # Every section with the book and chapters it reads.
    candidates = {}
    for b in books('bible-kjv-1.json'):
        if b['id'] in skip or 'Apocrypha' in b['title']:
            continue
        m = re.match(r'^Bible \(KJV\) (?:NT )?[\d-]+: (.+?)(?: \(.*\))?$', b['title'])
        single = m.group(1) if m and m.group(1) in work_of else None
        if m and m.group(1) == 'Phillippians':
            single = 'Philippians'
        for s in b['sections']:
            title = (s['title'] or single or '').replace('Philomon', 'Philemon')
            t = re.sub(r'^\d+\s*-\s*', '', title)
            t = re.sub(r'^Chapter \d+ - (?=[A-Z1-3])', '', t)
            book = next((n for n in names if t.startswith(n)), None)
            rest = t[len(book):] if book else t
            span = numbers(rest)
            book = book or single
            if not book:
                continue
            if span is None:
                # A whole book: a section named for the book, or a one-section project.
                if t.startswith(book) or len(b['sections']) == 1:
                    span = (1, chapters[book])
                else:
                    continue
            entry = section(b, s, 'bible-kjv', work_of[book], span[0], min(span[1], chapters[book]))
            candidates.setdefault(book, {}).setdefault(b['id'], []).append(entry)
    out = []
    for book, projects in candidates.items():
        # The finest reading of the book (most sections), solo before dramatic, a single book before the complete Bible.
        def rank(pid):
            title = projects[pid][0]['project']
            return (pid == '10501', 'Dramatic' in title, -len(projects[pid]), int(pid))
        order = sorted(projects, key=rank)
        covered = set()
        for pid in order:
            for e in projects[pid]:
                need = set(range(e['from'], e['to'] + 1)) - covered
                if need and (pid == order[0] or need == set(range(e['from'], e['to'] + 1))):
                    out.append(e)
                    covered |= need
        missing = set(range(1, chapters[book] + 1)) - covered
        if missing:
            print(f'{book}: no recording for chapters {sorted(missing)}')
    return out


def apocrypha():
    work = {
        'Book of Tobit': 'apocrypha-the-book-of-tobit',
        'Wisdom of Solomon': 'apocrypha-the-book-of-wisdom',
        '1 Maccabees': 'apocrypha-the-first-book-of-the-maccabees',
        '2 Maccabees': 'apocrypha-the-second-book-of-the-maccabees',
        'Prayer of Manasses': 'apocrypha-the-prayer-of-manasses-king-of-judah',
    }
    named = {
        'The History of Susanna': 'apocrypha-the-book-of-susanna',
        'Bel and the Dragon': 'apocrypha-the-history-of-the-destruction-of-bel-and-the-dragon',
        'Prayer of Azariah / Song of the Three Holy Children': 'apocrypha-the-song-of-the-three-holy-children',
    }
    out = []
    for b in books('apocrypha-kjv.json'):
        if b['id'] == '2180':  # a second Prayer of Manasses
            continue
        title = re.sub(r'^.*Deuterocanon:\s*', '', b['title']).strip()
        for s in b['sections']:
            if s['title'] in named:
                out.append(section(b, s, 'apocrypha-kjv', named[s['title']], 1, 999))
            elif title in work:
                span = numbers(s['title'] or '') or (1, 999)
                out.append(section(b, s, 'apocrypha-kjv', work[title], *span))
    return out


def classics():
    out = []
    pick = lambda name, pid: next(b for b in books(name) if b['id'] == pid)
    tao = pick('tao-te-ching.json', '419')
    for s in tao['sections']:
        out.append(section(tao, s, 'world-classics', 'tao-te-ching-legge', *numbers(s['title'])))
    dh = pick('dhammapada.json', '16165')
    for s in dh['sections']:
        n = roman(re.match(r'^Chapter ([IVXL]+)', s['title']).group(1))
        out.append(section(dh, s, 'world-classics', 'dhammapada-muller', n, n))
    gita = pick('gita-song-celestial.json', '9324')
    for s in gita['sections']:
        m = re.match(r'^Ch\w*ter ?(\d+)', s['title'])
        if m:
            out.append(section(gita, s, 'world-classics', 'bhagavad-gita-arnold', int(m.group(1)), int(m.group(1))))
    for name, pid, work in [('iliad.json', '690', 'iliad-butler'), ('odyssey.json', '65', 'odyssey-butler')]:
        b = pick(name, pid)
        for s in b['sections']:
            m = re.match(r'^Book (\d+|[IVXL]+)\b', s['title'])
            n = int(m.group(1)) if m.group(1).isdigit() else roman(m.group(1))
            out.append(section(b, s, 'world-classics', work, n, n))
    g = pick('gilgamesh.json', '17877')
    for s in g['sections']:
        if s['title'].startswith('The Babylonian Legend of the Deluge as Told'):
            out.append(section(g, s, 'oldest-texts', 'gilgamesh-deluge-budge', 11, 11))
    return out


def main():
    recordings = bible() + apocrypha() + classics()
    for r in recordings:
        assert r['from'] <= r['to'], r
        assert r['url'].startswith('https://') and r['url'].endswith('.mp3'), r
    data = {
        'format_version': 1,
        'source': 'LibriVox (librivox.org), public domain recordings hosted by the Internet Archive',
        'recordings': recordings,
    }
    (LIB / 'recordings.json').write_text(json.dumps(data, ensure_ascii=False, indent=0) + '\n')
    print(f'{len(recordings)} recordings')


main()
