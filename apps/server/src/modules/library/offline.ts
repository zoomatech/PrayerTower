// Offline texts (docs/LIBRARY_SEARCH.md): the native app can download the collections the member's community is
// offered and search them on the device with no signal. The download is the collection file itself (gzipped
// JSON, public-domain works only), sent as is. Off by default.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Queryable } from '../../db.js';
import { forbidden } from '../../errors.js';
import { collection, dataDir, features, offered, TITLES, type CollectionId } from './index.js';

const files = new Map<CollectionId, { bytes: Buffer; version: string }>();

function file(id: CollectionId) {
  let f = files.get(id);
  if (!f) {
    const bytes = readFileSync(path.join(dataDir(), `${id}.json.gz`));
    f = { bytes, version: createHash('sha256').update(bytes).digest('hex').slice(0, 16) };
    files.set(id, f);
  }
  return f;
}

async function allowed(q: Queryable, userId: string) {
  if (!(await features(q)).libraryOffline) return null;
  return offered(q, userId);
}

/** What can be downloaded: each collection's size and a version that changes when its text is rebuilt. */
export async function list(q: Queryable, userId: string) {
  const ids = await allowed(q, userId);
  if (!ids) return { enabled: false as const };
  return {
    enabled: true as const,
    collections: ids.map((id) => ({ id, title: TITLES[id].title, faith: TITLES[id].faith, version: file(id).version, bytes: file(id).bytes.length, passages: collection(id).index.passages.length })),
  };
}

/** The collection file, for the app to keep. */
export async function download(q: Queryable, userId: string, id: CollectionId) {
  const ids = await allowed(q, userId);
  if (!ids) throw forbidden('Offline texts are off');
  if (!ids.includes(id)) throw forbidden('This collection is not offered in your community');
  return file(id);
}
