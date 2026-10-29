// Scripture and ancient writings search (docs/LIBRARY_SEARCH.md), ported from Winstons Syndicate. Off by default.
// Each collection is one gzipped JSON file in apps/server/data/library: its works and their passages, in order.
// Adding a text (say, the Instructions of Shuruppak) is adding a collection file and listing it in COLLECTIONS.
// The Bible is never offered in a community with neutral wording (Open Circle); the ancient writings are.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as communities from '../communities/index.js';
import { PassageIndex, parseSynonyms, type Passage } from './search.js';

type Work = { id: string; title: string; author: string; rights: 'public_domain' };
type CollectionFile = { format_version: 1; id: string; title: string; faith: boolean; source: string; works: Work[]; passages: Passage[] };
type Collection = { id: string; title: string; faith: boolean; source: string; works: Map<string, Work>; index: PassageIndex };

/** The collections, in the order the app lists them. */
export const COLLECTIONS = ['bible-kjv', 'ancient-writings'] as const;
export type CollectionId = (typeof COLLECTIONS)[number];

export function dataDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'data', 'library');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error('The library texts (apps/server/data/library) are missing');
}

const read = (name: string) => gunzipSync(readFileSync(path.join(dataDir(), name))).toString('utf8');

let synonyms: Map<string, string[]> | undefined;
const loaded = new Map<CollectionId, Collection>();

/** Loads a collection the first time it is searched (a few seconds for the Bible) and keeps it. */
export function collection(id: CollectionId): Collection {
  const known = loaded.get(id);
  if (known) return known;
  const file = JSON.parse(read(`${id}.json.gz`)) as CollectionFile;
  if (file.format_version !== 1 || file.id !== id) throw new Error(`Library collection ${id} is not readable`);
  // Only public-domain works are shipped; anything else is dropped, never shown.
  const works = new Map(file.works.filter((w) => w.rights === 'public_domain').map((w) => [w.id, w]));
  synonyms ??= parseSynonyms(read('kjv-synonyms.txt.gz'));
  const made = { id, title: file.title, faith: file.faith, source: file.source, works, index: new PassageIndex(file.passages.filter((p) => works.has(p.workId)), synonyms) };
  loaded.set(id, made);
  return made;
}

async function enabled(q: Queryable) {
  const { rows } = await q.query<{ enabled: boolean }>('select enabled from public.library_settings');
  return rows[0]?.enabled === true;
}

export async function settings(q: Queryable) {
  return { enabled: await enabled(q) };
}

export const SettingsPatch = z.object({ enabled: z.boolean() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.library_settings set enabled = $1', [p.enabled]);
  return settings(q);
}

/** The collections this member may search. */
async function offered(q: Queryable, userId: string): Promise<CollectionId[] | null> {
  if (!(await enabled(q))) return null;
  const secular = await communities.isSecular(q, userId);
  return COLLECTIONS.filter((id) => !(secular && id === 'bible-kjv'));
}

const TITLES: Record<CollectionId, { title: string; faith: boolean }> = {
  'bible-kjv': { title: 'King James Bible', faith: true },
  'ancient-writings': { title: 'Ancient writings', faith: false },
};

export async function overview(q: Queryable, userId: string) {
  const ids = await offered(q, userId);
  if (!ids) return { enabled: false as const };
  return { enabled: true as const, collections: ids.map((id) => ({ id, ...TITLES[id] })) };
}

export const Search = z.object({
  q: z.string().trim().min(1).max(200),
  collection: z.enum(COLLECTIONS),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function search(q: Queryable, userId: string, input: z.infer<typeof Search>) {
  const ids = await offered(q, userId);
  if (!ids) throw forbidden('Library search is off');
  if (!ids.includes(input.collection)) throw forbidden('This collection is not offered in your community');
  const c = collection(input.collection);
  const hits = c.index.search(input.q);
  return {
    total: hits.length,
    source: c.source,
    hits: hits.slice(input.offset, input.offset + input.limit).map(({ index, complete }) => {
      const p = c.index.passages[index]!;
      const work = c.works.get(p.workId)!;
      // A Bible verse's reference already names its book; an ancient passage is credited to its work.
      return { ref: p.ref, text: p.text, complete, work: { id: work.id, title: work.title, author: work.author } };
    }),
  };
}
