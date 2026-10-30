// Listening (docs/LIBRARY_SEARCH.md): the app reads any passage aloud with the device's own voice (nothing
// leaves the device), and where LibriVox has a public-domain recording of the same translation, it offers that
// too, with the reader's credit. The recordings are matched to the place they read (a Bible chapter, a book of
// the Iliad) in data/library/recordings.json, built by scripts/library-recordings.py. Off by default.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { byKey, collection, COLLECTIONS, dataDir, features, offered, type CollectionId } from './index.js';

type Recording = { collection: CollectionId; workId: string; from: number; to: number; url: string; title: string; readers: string[]; seconds: number; project: string; projectUrl: string };

let recordings: Map<string, Recording[]> | undefined;

function all() {
  if (recordings) return recordings;
  const file = JSON.parse(readFileSync(path.join(dataDir(), 'recordings.json'), 'utf8')) as { format_version: 1; recordings: Recording[] };
  if (file.format_version !== 1) throw new Error('recordings.json is not readable');
  recordings = new Map();
  for (const r of file.recordings) {
    const k = `${r.collection}/${r.workId}`;
    recordings.set(k, [...(recordings.get(k) ?? []), r]);
  }
  return recordings;
}

const roman = (s: string) => {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let total = 0;
  for (let i = 0; i < s.length; i++) total += v[s[i]!]! < (v[s[i + 1]!] ?? 0) ? -v[s[i]!]! : v[s[i]!]!;
  return total;
};

/** The chapter (or book, or tablet) a heading names, by the way each work numbers its places. */
function unitOf(collectionId: CollectionId, workId: string, ref: string): number | null {
  let m: RegExpExecArray | null;
  if (collectionId === 'bible-kjv' || collectionId === 'apocrypha-kjv') {
    if ((m = /(\d+):\d+$/.exec(ref))) return Number(m[1]);
    // Books read whole (the Prayer of Manasses; Susanna, Bel and the Song of the Three are one section each).
    return 1;
  }
  if (workId === 'gilgamesh-deluge-budge') return /^Tablet XI, line/.test(ref) ? 11 : null;
  if ((m = /^Chapter (\d+)\b/.exec(ref))) return Number(m[1]);
  if ((m = /^(?:CHAPTER|BOOK) ([IVXL]+)$/.exec(ref))) return roman(m[1]!);
  return null;
}

/** The unit a passage belongs to: its own heading, or the last chapter heading before it in the same work. */
function unitAt(collectionId: CollectionId, index: number) {
  const { passages } = collection(collectionId).index;
  const workId = passages[index]!.workId;
  const walk = collectionId === 'bible-kjv' || collectionId === 'apocrypha-kjv' || workId === 'gilgamesh-deluge-budge' ? 1 : 400;
  for (let i = index; i >= 0 && index - i < walk && passages[i]!.workId === workId; i--) {
    const u = unitOf(collectionId, workId, passages[i]!.ref);
    if (u !== null) return { workId, unit: u };
  }
  return null;
}

export const ListenQuery = z.object({ collection: z.enum(COLLECTIONS), key: z.string().regex(/^[0-9a-f]{32}$/) });

/** A public-domain recording of the place a passage is in, or null; the device voice needs no server. */
export async function recording(q: Queryable, userId: string, input: z.infer<typeof ListenQuery>) {
  if (!(await features(q)).libraryListen) throw forbidden('Listening is off');
  const ids = await offered(q, userId);
  if (!ids?.includes(input.collection)) throw forbidden('This collection is not offered in your community');
  const found = byKey(input.collection, input.key);
  if (!found) throw notFound('Passage');
  const at = unitAt(input.collection, found.index);
  const r = at && all().get(`${input.collection}/${at.workId}`)?.find((x) => x.from <= at.unit && at.unit <= x.to);
  if (!r) return { recording: null };
  return {
    recording: {
      url: r.url,
      title: r.title,
      project: r.project,
      readers: r.readers,
      seconds: r.seconds,
      credit: `${r.readers.length ? `Read by ${r.readers.join(', ')}` : 'Read'} for LibriVox: ${r.project}, “${r.title}”. Public domain.`,
      projectUrl: r.projectUrl,
    },
  };
}
