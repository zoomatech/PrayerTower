// Word study (docs/LIBRARY_SEARCH.md): tap a word of the King James Bible for its Hebrew or Greek root, its
// meaning and other verses that use it. The words carry Strong's numbers (eBible.org eng-kjv2006, public domain)
// and the meanings are Strong's own Hebrew (1894) and Greek (1890) dictionaries, both public domain, built by
// scripts/library-strongs.py. Off by default; offered only where the King James Bible is (never Open Circle).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { citation, collection, dataDir, features, offered, passageKey } from './index.js';

/** Plain words, or a tagged word with its Strong's numbers. */
type Token = string | [string, string[]];
type Entry = { lemma: string; translit: string; pron: string; derivation: string; definition: string; kjv: string };

let tagged: { refs: string[]; verses: Token[][]; at: Map<string, number>; uses: Map<string, number[]> } | undefined;
let entries: Record<string, Entry> | undefined;

const read = (name: string) => JSON.parse(gunzipSync(readFileSync(path.join(dataDir(), name))).toString('utf8'));

function words() {
  if (tagged) return tagged;
  const file = read('kjv-strongs.json.gz') as { format_version: 1; refs: string[]; verses: Token[][] };
  if (file.format_version !== 1) throw new Error('kjv-strongs.json.gz is not readable');
  const uses = new Map<string, number[]>();
  file.verses.forEach((tokens, i) => {
    for (const t of tokens) {
      if (typeof t === 'string') continue;
      for (const n of t[1]) {
        const list = uses.get(n) ?? [];
        if (list[list.length - 1] !== i) list.push(i);
        uses.set(n, list);
      }
    }
  });
  tagged = { refs: file.refs, verses: file.verses, at: new Map(file.refs.map((r, i) => [r, i])), uses };
  return tagged;
}

function dictionary() {
  entries ??= (read('strongs-dictionary.json.gz') as { entries: Record<string, Entry> }).entries;
  return entries;
}

async function allowed(q: Queryable, userId: string) {
  if (!(await features(q)).libraryWords) throw forbidden('Word study is off');
  const ids = await offered(q, userId);
  if (!ids?.includes('bible-kjv')) throw forbidden('Word study is not offered in your community');
}

export const VerseQuery = z.object({ ref: z.string().trim().min(3).max(60) });

/** A verse as words, each tagged word with its numbers and their dictionary words. */
export async function verse(q: Queryable, userId: string, ref: string) {
  await allowed(q, userId);
  const w = words();
  const i = w.at.get(ref);
  if (i === undefined) throw notFound('Verse');
  const dict = dictionary();
  const numbers = new Set(w.verses[i]!.flatMap((t) => (typeof t === 'string' ? [] : t[1])));
  const kjv = collection('bible-kjv');
  const p = kjv.index.passages[i]!;
  return {
    ref,
    citation: citation('bible-kjv', ref, kjv.works.get(p.workId)!),
    key: passageKey(p),
    words: w.verses[i]!.map((t) => (typeof t === 'string' ? { text: t, strongs: [] } : { text: t[0], strongs: t[1] })),
    roots: Object.fromEntries([...numbers].filter((n) => dict[n]).map((n) => [n, { lemma: dict[n]!.lemma, translit: dict[n]!.translit }])),
  };
}

export const EntryParams = z.object({ id: z.string().regex(/^[HG]\d{1,4}$/) });
export const EntryQuery = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(50).default(20) });

/** One Strong's number: the word, its meaning, and the verses that use it, in Bible order. */
export async function entry(q: Queryable, userId: string, id: string, page: z.infer<typeof EntryQuery>) {
  await allowed(q, userId);
  const e = dictionary()[id];
  if (!e) throw notFound('Word');
  const uses = words().uses.get(id) ?? [];
  const kjv = collection('bible-kjv');
  return {
    id,
    language: id.startsWith('H') ? 'Hebrew' : 'Greek',
    ...e,
    total: uses.length,
    verses: uses.slice(page.offset, page.offset + page.limit).map((i) => {
      const p = kjv.index.passages[i]!;
      // The words this verse renders the number with, as tagged.
      const as = words().verses[i]!.flatMap((t) => (typeof t !== 'string' && t[1].includes(id) ? [t[0]] : []));
      return { ref: p.ref, text: p.text, as, citation: citation('bible-kjv', p.ref, kjv.works.get(p.workId)!), key: passageKey(p) };
    }),
  };
}
