// The media bucket is private, so cards carry short-lived signed read URLs.
import type { SupabaseClient } from '@supabase/supabase-js';

export const MEDIA_BUCKET = 'post-media';
const READ_URL_SECONDS = 60 * 60;

type WithMedia = { media: { kind: string; storagePath: string; url?: string | null }[] };

/** Add a signed `url` to every media item on the given cards (one Storage call). */
export async function signMedia<T extends WithMedia>(storage: SupabaseClient | null, cards: T[]): Promise<T[]> {
  const paths = cards.flatMap((c) => c.media.map((m) => m.storagePath));
  if (!storage || paths.length === 0) return cards;
  const { data, error } = await storage.storage.from(MEDIA_BUCKET).createSignedUrls(paths, READ_URL_SECONDS);
  if (error || !data) return cards;
  const urls = new Map(data.map((d) => [d.path, d.signedUrl]));
  for (const c of cards) for (const m of c.media) m.url = urls.get(m.storagePath) ?? null;
  return cards;
}
