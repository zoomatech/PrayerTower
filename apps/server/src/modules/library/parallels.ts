// Parallels (docs/LIBRARY_SEARCH.md): related passages side by side across texts, from the curated file
// data/library/parallels.json: the flood in Genesis, Gilgamesh and Berossus; creation in Genesis, Enuma Elish
// and Hesiod; Moses's laws beside Hammurabi's. Each side names its passage by reference or by words it holds;
// the words shown and the citation always come from the collection itself. Off by default.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { citation, collection, COLLECTIONS, dataDir, features, offered, passageKey, TITLES, type CollectionId } from './index.js';

type SideSpec = { collection: CollectionId; ref?: string; find?: string; workId?: string; count?: number; label?: string; cite?: string };
type ThemeSpec = { id: string; title: string; intro: string; sides: SideSpec[] };

/** Some passages from one place in a collection, joined, with their citation. */
export function excerpt(id: CollectionId, from: number, count: number, cite?: string) {
  const c = collection(id);
  const first = c.index.passages[from]!;
  const taken = c.index.passages.slice(from, from + count).filter((p) => p.workId === first.workId);
  const last = taken[taken.length - 1]!;
  const work = c.works.get(first.workId)!;
  const ref = cite ?? (last.ref === first.ref ? first.ref : `${first.ref} to ${last.ref}`);
  return {
    collection: id,
    collectionTitle: TITLES[id].title,
    work: { id: work.id, title: work.title, author: work.author },
    ref,
    text: taken.map((p) => p.text).join('\n\n'),
    citation: citation(id, ref, work),
    // Highlights and notes attach to the first passage.
    key: passageKey(first),
  };
}

const located = new Map<string, number>();

/** Where a side starts, or -1 when the collection has no such passage. */
export function locate(side: SideSpec) {
  const key = JSON.stringify([side.collection, side.workId, side.ref, side.find]);
  const known = located.get(key);
  if (known !== undefined) return known;
  const { passages } = collection(side.collection).index;
  const find = side.find?.toLowerCase();
  const at = passages.findIndex(
    (p) => (!side.workId || p.workId === side.workId) && (side.ref ? p.ref === side.ref : !!find && p.text.toLowerCase().includes(find)),
  );
  located.set(key, at);
  return at;
}

let themes: ThemeSpec[] | undefined;

export function themeSpecs(): ThemeSpec[] {
  if (themes) return themes;
  const file = JSON.parse(readFileSync(path.join(dataDir(), 'parallels.json'), 'utf8')) as { format_version: 1; themes: ThemeSpec[] };
  if (file.format_version !== 1) throw new Error('parallels.json is not readable');
  for (const t of file.themes) for (const s of t.sides) if (!COLLECTIONS.includes(s.collection)) throw new Error(`parallels.json: ${t.id} names ${s.collection}`);
  themes = file.themes;
  return themes;
}

/** The sides this member may see: no Bible or Apocrypha in Open Circle, and only sides that resolve. */
function sidesFor(theme: ThemeSpec, ids: CollectionId[]) {
  return theme.sides.filter((s) => ids.includes(s.collection) && locate(s) >= 0);
}

/** A theme is a parallel only with passages from two different works. */
const isParallel = (sides: SideSpec[]) => new Set(sides.map((s) => `${s.collection}:${s.workId ?? collection(s.collection).index.passages[locate(s)]!.workId}`)).size >= 2;

async function allowed(q: Queryable, userId: string) {
  const f = await features(q);
  return f.libraryParallels ? offered(q, userId) : null;
}

export async function list(q: Queryable, userId: string) {
  const ids = await allowed(q, userId);
  if (!ids) return { enabled: false as const };
  return {
    enabled: true as const,
    themes: themeSpecs()
      .map((t) => ({ t, sides: sidesFor(t, ids) }))
      .filter(({ sides }) => isParallel(sides))
      .map(({ t, sides }) => ({ id: t.id, title: t.title, intro: t.intro, texts: [...new Set(sides.map((s) => TITLES[s.collection].title))] })),
  };
}

export async function theme(q: Queryable, userId: string, id: string) {
  const ids = await allowed(q, userId);
  if (!ids) throw forbidden('Parallels are off');
  const t = themeSpecs().find((x) => x.id === id);
  const sides = t ? sidesFor(t, ids) : [];
  if (!t || !isParallel(sides)) throw notFound('Parallel');
  return {
    id: t.id,
    title: t.title,
    intro: t.intro,
    sides: sides.map((s) => ({ label: s.label ?? null, ...excerpt(s.collection, locate(s), s.count ?? 1, s.cite) })),
  };
}
