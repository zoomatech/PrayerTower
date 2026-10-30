// Scripture and ancient writings search (docs/LIBRARY_SEARCH.md), ported from Winstons Syndicate. Off by default.
// Each collection is one gzipped JSON file in apps/server/data/library: its works and their passages, in order.
// Adding a text (say, the Instructions of Shuruppak) is adding a collection file and listing it in COLLECTIONS.
// The Bible is never offered in a community with neutral wording (Open Circle); the ancient writings are.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden } from '../../errors.js';
import * as communities from '../communities/index.js';
import { PassageIndex, parseSynonyms, type Passage } from './search.js';

export type Work = { id: string; title: string; author: string; rights: 'public_domain' };
type CollectionFile = { format_version: 1; id: string; title: string; faith: boolean; source: string; works: Work[]; passages: Passage[] };
type Collection = { id: string; title: string; faith: boolean; source: string; works: Map<string, Work>; index: PassageIndex };

/** The collections, in the order the app lists them. */
export const COLLECTIONS = ['bible-kjv', 'apocrypha-kjv', 'ancient-writings', 'oldest-texts', 'world-classics'] as const;
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

type Settings = Record<'enabled' | 'shareEnabled' | 'dailyEnabled' | 'parallelsEnabled' | 'plansEnabled' | 'wordsEnabled' | 'notesEnabled' | 'offlineEnabled', boolean>;
const OFF: Settings = { enabled: false, shareEnabled: false, dailyEnabled: false, parallelsEnabled: false, plansEnabled: false, wordsEnabled: false, notesEnabled: false, offlineEnabled: false };

export async function settings(q: Queryable) {
  const { rows } = await q.query<Settings>(
    `select enabled, share_enabled as "shareEnabled", daily_enabled as "dailyEnabled", parallels_enabled as "parallelsEnabled",
            plans_enabled as "plansEnabled", words_enabled as "wordsEnabled", notes_enabled as "notesEnabled",
            offline_enabled as "offlineEnabled" from public.library_settings`,
  );
  return rows[0] ?? OFF;
}

const enabled = async (q: Queryable) => (await settings(q)).enabled;

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  shareEnabled: z.boolean().optional(),
  dailyEnabled: z.boolean().optional(),
  parallelsEnabled: z.boolean().optional(),
  plansEnabled: z.boolean().optional(),
  wordsEnabled: z.boolean().optional(),
  notesEnabled: z.boolean().optional(),
  offlineEnabled: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.library_settings set enabled = coalesce($1, enabled), share_enabled = coalesce($2, share_enabled),
       daily_enabled = coalesce($3, daily_enabled), parallels_enabled = coalesce($4, parallels_enabled), plans_enabled = coalesce($5, plans_enabled),
       words_enabled = coalesce($6, words_enabled), notes_enabled = coalesce($7, notes_enabled), offline_enabled = coalesce($8, offline_enabled)`,
    [p.enabled ?? null, p.shareEnabled ?? null, p.dailyEnabled ?? null, p.parallelsEnabled ?? null, p.plansEnabled ?? null, p.wordsEnabled ?? null, p.notesEnabled ?? null, p.offlineEnabled ?? null],
  );
  return settings(q);
}

/** The switches the app needs: sharing, the daily card, parallels and reading plans only count while search itself is on. */
export async function features(q: Queryable) {
  const s = await settings(q);
  return {
    library: s.enabled,
    libraryShare: s.enabled && s.shareEnabled,
    libraryDaily: s.enabled && s.dailyEnabled,
    libraryParallels: s.enabled && s.parallelsEnabled,
    libraryPlans: s.enabled && s.plansEnabled,
    libraryWords: s.enabled && s.wordsEnabled,
    libraryNotes: s.enabled && s.notesEnabled,
    libraryOffline: s.enabled && s.offlineEnabled,
  };
}

/** "Psalms 23:1 (King James Bible)" or "Meditations, Book IV (Marcus Aurelius)": what a shared passage is credited to. */
export function citation(id: CollectionId, ref: string, work: Work) {
  if (id === 'bible-kjv') return `${ref} (King James Bible)`;
  if (id === 'apocrypha-kjv') return `${ref} (King James Apocrypha)`;
  const where = ref && ref !== work.title ? `${work.title}, ${ref}` : work.title;
  return work.author ? `${where} (${work.author})` : where;
}

/** A passage's lasting name for highlights and notes: a fingerprint of its work, reference and words. */
export function passageKey(p: Passage) {
  return createHash('sha256').update(`${p.workId}\n${p.ref}\n${p.text}`).digest('hex').slice(0, 32);
}

const keyed = new Map<CollectionId, Map<string, number>>();

/** The passage with this key in a collection, or undefined. */
export function byKey(id: CollectionId, key: string) {
  let map = keyed.get(id);
  if (!map) {
    map = new Map(collection(id).index.passages.map((p, i) => [passageKey(p), i]));
    keyed.set(id, map);
  }
  const at = map.get(key);
  return at === undefined ? undefined : { index: at, passage: collection(id).index.passages[at]! };
}

/** The collections this member may search. */
export async function offered(q: Queryable, userId: string): Promise<CollectionId[] | null> {
  if (!(await enabled(q))) return null;
  const secular = await communities.isSecular(q, userId);
  // Open Circle gets every collection but the Bible and its Apocrypha.
  return COLLECTIONS.filter((id) => !(secular && TITLES[id].faith));
}

export const TITLES: Record<CollectionId, { title: string; faith: boolean }> = {
  'bible-kjv': { title: 'King James Bible', faith: true },
  'apocrypha-kjv': { title: 'King James Apocrypha', faith: true },
  'ancient-writings': { title: 'Ancient writings', faith: false },
  // The oldest texts on the list in docs/LIBRARY_SEARCH.md that have a public-domain translation.
  'oldest-texts': { title: 'Oldest texts', faith: false },
  // Public-domain translations of other traditions' classics: Tao Te Ching, Analects, Dhammapada, Gita, Hesiod, Homer.
  'world-classics': { title: 'World classics', faith: false },
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
      return {
        ref: p.ref,
        text: p.text,
        complete,
        work: { id: work.id, title: work.title, author: work.author },
        citation: citation(input.collection, p.ref, work),
        key: passageKey(p),
      };
    }),
  };
}

// The daily passage --------------------------------------------------------------------

const candidates = new Map<CollectionId, number[]>();

/** Passages short enough for a card, in order; picked from by the day. */
function cardPassages(id: CollectionId) {
  const known = candidates.get(id);
  if (known) return known;
  const list = collection(id).index.passages.flatMap((p, i) => (p.text.length >= 60 && p.text.length <= 320 ? [i] : []));
  candidates.set(id, list);
  return list;
}

/** A number from the date, the same all day for everyone (FNV-1a). */
function dayNumber(day: string) {
  let h = 2166136261;
  for (const c of day) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Today's passage: the King James Bible for faith communities, the ancient writings in Open Circle. */
export async function daily(q: Queryable, userId: string, day = new Date().toISOString().slice(0, 10)) {
  const f = await features(q);
  const ids = f.libraryDaily ? await offered(q, userId) : null;
  if (!ids) return { enabled: false as const };
  const id: CollectionId = ids.includes('bible-kjv') ? 'bible-kjv' : 'ancient-writings';
  const list = cardPassages(id);
  const c = collection(id);
  const p = c.index.passages[list[dayNumber(day) % list.length]!]!;
  const work = c.works.get(p.workId)!;
  return { enabled: true as const, day, share: f.libraryShare, passage: { collection: id, ref: p.ref, text: p.text, complete: true, work: { id: work.id, title: work.title, author: work.author }, citation: citation(id, p.ref, work) } };
}
