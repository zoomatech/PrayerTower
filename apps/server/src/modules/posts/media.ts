// The media bucket is private, so cards carry short-lived signed read URLs.
import type { SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'post-media';
const READ_URL_SECONDS = 60 * 60;

type WithMedia = { media: { kind: string; storagePath: string; url?: string | null }[]; author?: { photoPath?: string; photoUrl?: string | null } };

/** Add a signed `url` to every media item, and the poster's `photoUrl`, on the given cards (one Storage call). */
export async function signMedia<T extends WithMedia>(storage: SupabaseClient | null, cards: T[]): Promise<T[]> {
  const photos = cards.flatMap((c) => (c.author?.photoPath ? [c.author.photoPath] : []));
  const paths = [...new Set([...cards.flatMap((c) => c.media.map((m) => m.storagePath)), ...photos])];
  const urls = new Map<string, string>();
  if (storage && paths.length) {
    const { data } = await storage.storage.from(MEDIA_BUCKET).createSignedUrls(paths, READ_URL_SECONDS);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  for (const c of cards) {
    for (const m of c.media) if (urls.size) m.url = urls.get(m.storagePath) ?? null;
    // The storage path stays on the server.
    if (c.author?.photoPath) {
      c.author.photoUrl = urls.get(c.author.photoPath) ?? null;
      delete c.author.photoPath;
    }
  }
  return cards;
}

/** A signed URL for one photo, or null. */
export async function signPhoto(storage: SupabaseClient | null, path: string | null | undefined): Promise<string | null> {
  if (!storage || !path) return null;
  const { data } = await storage.storage.from(MEDIA_BUCKET).createSignedUrl(path, READ_URL_SECONDS);
  return data?.signedUrl ?? null;
}
