// Listening (docs/LIBRARY_SEARCH.md): the app reads any passage aloud with the device's own voice (nothing
// leaves the device), and where LibriVox has a public-domain recording of the same translation, it offers that
// too, with the reader's credit. The recordings are matched to the place they read (a Bible chapter, a book of
// the Iliad) in data/library/recordings.json, built by scripts/library-recordings.py. Each member's place is kept
// (library_listening), so they can pick up where they left off, and their listening history listed. Off by default.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden, notFound } from '../../errors.js';
import { byKey, citation, collection, COLLECTIONS, dataDir, features, offered, type CollectionId } from './index.js';

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

async function allowed(q: Queryable, userId: string) {
  if (!(await features(q)).libraryListen) throw forbidden('Listening is off');
  const ids = await offered(q, userId);
  if (!ids) throw forbidden('Library search is off');
  return ids;
}

/** The recording of the place the passage at `index` is in, shaped for the app, or null. */
function recordingAt(id: CollectionId, index: number) {
  const at = unitAt(id, index);
  const r = at && all().get(`${id}/${at.workId}`)?.find((x) => x.from <= at.unit && at.unit <= x.to);
  if (!r) return null;
  return {
    url: r.url,
    title: r.title,
    project: r.project,
    readers: r.readers,
    seconds: r.seconds,
    credit: `${r.readers.length ? `Read by ${r.readers.join(', ')}` : 'Read'} for LibriVox: ${r.project}, “${r.title}”. Public domain.`,
    projectUrl: r.projectUrl,
  };
}

/** A public-domain recording of the place a passage is in, or null; the device voice needs no server. */
export async function recording(q: Queryable, userId: string, input: z.infer<typeof ListenQuery>) {
  const ids = await allowed(q, userId);
  if (!ids.includes(input.collection)) throw forbidden('This collection is not offered in your community');
  const found = byKey(input.collection, input.key);
  if (!found) throw notFound('Passage');
  return { recording: recordingAt(input.collection, found.index) };
}

// Where each member left off --------------------------------------------------------------

export const ProgressInput = z.object({
  collection: z.enum(COLLECTIONS),
  key: z.string().regex(/^[0-9a-f]{32}$/),
  kind: z.enum(['voice', 'recording']),
  // The device's voice: characters already read. A recording: seconds already played.
  position: z.number().min(0).max(1_000_000),
  duration: z.number().min(0).max(1_000_000).nullable().optional(),
  finished: z.boolean().optional(),
});

/** Keeps the member's place in a passage or its recording; the newest place is the one offered to pick up. */
export async function saveProgress(q: Queryable, userId: string, input: z.infer<typeof ProgressInput>) {
  const ids = await allowed(q, userId);
  if (!ids.includes(input.collection)) throw forbidden('This collection is not offered in your community');
  const found = byKey(input.collection, input.key);
  if (!found) throw notFound('Passage');
  const p = found.passage;
  const work = collection(input.collection).works.get(p.workId)!;
  const title = input.kind === 'recording' ? (recordingAt(input.collection, found.index)?.title ?? null) : null;
  if (input.kind === 'recording' && !title) throw notFound('Recording');
  await q.query(
    `insert into public.library_listening (user_id, collection, passage_key, ref, citation, kind, position, duration, recording_title, finished)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, collection, passage_key, kind) do update set position = excluded.position,
       duration = coalesce(excluded.duration, library_listening.duration), recording_title = excluded.recording_title,
       finished = excluded.finished, updated_at = now()`,
    [userId, input.collection, input.key, p.ref.slice(0, 200), citation(input.collection, p.ref, work).slice(0, 300), input.kind, input.position, input.duration ?? null, title, input.finished ?? false],
  );
  return { saved: true };
}

type ListenRow = { collection: CollectionId; passage_key: string; ref: string; citation: string; kind: 'voice' | 'recording'; position: string; duration: string | null; recording_title: string | null; finished: boolean; updated_at: Date };

/** The member's listening history, newest first, and the place to offer to pick up (the newest not finished). */
export async function history(q: Queryable, userId: string) {
  const ids = await allowed(q, userId);
  const { rows } = await q.query<ListenRow>(
    `select collection, passage_key, ref, citation, kind, position, duration, recording_title, finished, updated_at
       from public.library_listening where user_id = $1 and collection = any($2::text[])
      order by updated_at desc limit 100`,
    [userId, ids],
  );
  const items = rows.flatMap((r) => {
    const found = byKey(r.collection, r.passage_key);
    // A passage gone from a rebuilt text can't be played again; it drops out of the list.
    if (!found) return [];
    const rec = r.kind === 'recording' ? recordingAt(r.collection, found.index) : null;
    if (r.kind === 'recording' && !rec) return [];
    return [
      {
        collection: r.collection,
        key: r.passage_key,
        ref: r.ref,
        citation: r.citation,
        text: found.passage.text,
        kind: r.kind,
        position: Number(r.position),
        duration: r.duration === null ? null : Number(r.duration),
        finished: r.finished,
        recording: rec,
        updatedAt: r.updated_at.toISOString(),
      },
    ];
  });
  return { resume: items.find((i) => !i.finished) ?? null, history: items };
}
