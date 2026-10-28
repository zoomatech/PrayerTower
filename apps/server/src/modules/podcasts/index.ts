// Podcasts (migration 20261029004900_podcasts.sql; docs/PODCASTS.md). Off until
// Admin → Notebook ideas turns podcasts on. Staff add a show and its episodes,
// with audio hosted elsewhere and linked by an https URL. Members listen in the
// app; each published show also has a public RSS feed for podcast apps, built to
// Apple's feed requirements (podcasters.apple.com/support/823-podcast-requirements).
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select podcasts_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

export interface Episode {
  id: string;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  audioBytes: number;
  audioType: string;
  durationSeconds: number | null;
  episodeNumber: number | null;
  publishedAt: string | null;
}
export interface Show {
  id: string;
  slug: string;
  community: string | null;
  title: string;
  description: string;
  author: string;
  imageUrl: string | null;
  category: string;
  published: boolean;
  episodes: Episode[];
}

const EPISODE = `jsonb_build_object('id', e.id, 'guid', e.guid, 'title', e.title, 'description', e.description, 'audioUrl', e.audio_url,
  'audioBytes', e.audio_bytes, 'audioType', e.audio_type, 'durationSeconds', e.duration_seconds, 'episodeNumber', e.episode_number,
  'publishedAt', e.published_at)`;
const SHOW = (onlyPublished: boolean) => `s.id, s.slug, c.slug as community, s.title, s.description, s.author, s.image_url as "imageUrl", s.category, s.published,
  coalesce((select jsonb_agg(${EPISODE} order by e.published_at desc nulls first, e.created_at desc) from public.podcast_episodes e
             where e.show_id = s.id ${onlyPublished ? 'and e.published_at is not null and e.published_at <= now()' : ''}), '[]') as episodes`;
const FROM = 'from public.podcast_shows s left join public.communities c on c.id = s.community_id';

/** Published shows for the member's community, with their published episodes. Empty while switched off. */
export async function forMember(q: Queryable, userId: string): Promise<Show[]> {
  if (!(await enabled(q))) return [];
  const { rows } = await q.query<Show>(
    `select ${SHOW(true)} ${FROM} where s.published and (s.community_id is null or s.community_id = public.member_community_id($1)) order by s.title`,
    [userId],
  );
  return rows.filter((s) => s.episodes.length > 0);
}

// Admins ---------------------------------------------------------------------------

export async function list(q: Queryable): Promise<Show[]> {
  const { rows } = await q.query<Show>(`select ${SHOW(false)} ${FROM} order by s.created_at desc`);
  return rows;
}

async function get(q: Queryable, id: string): Promise<Show> {
  const { rows } = await q.query<Show>(`select ${SHOW(false)} ${FROM} where s.id = $1`, [id]);
  if (!rows[0]) throw notFound('Show');
  return rows[0];
}

const https = z.url({ protocol: /^https$/ }).max(2000);

export const NewShow = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,40}$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  author: z.string().trim().min(1).max(120),
  imageUrl: https.nullable().optional(),
  /** An Apple Podcasts category, e.g. "Religion & Spirituality" or "Society & Culture". */
  category: z.string().trim().min(1).max(80).optional(),
  /** A community's short name, or null for everyone. */
  community: z.string().regex(/^[a-z0-9-]{3,40}$/).nullable().optional(),
});

async function communityId(q: Queryable, slug: string | null | undefined) {
  if (!slug) return null;
  const { rows } = await q.query<{ id: string; neutral: boolean }>(
    `select id, coalesce(vocabulary->>'wording', case when tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral' as neutral
       from public.communities where slug = $1`,
    [slug],
  );
  if (!rows[0]) throw notFound('Community');
  return rows[0];
}

export async function createShow(q: Queryable, adminId: string, input: z.infer<typeof NewShow>): Promise<Show> {
  const c = await communityId(q, input.community);
  try {
    const { rows } = await q.query<{ id: string }>(
      `insert into public.podcast_shows (slug, community_id, title, description, author, image_url, category, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [input.slug, c?.id ?? null, input.title, input.description, input.author, input.imageUrl ?? null, input.category ?? (c?.neutral ? 'Society & Culture' : 'Religion & Spirituality'), adminId],
    );
    return get(q, rows[0]!.id);
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw conflict('That short name is taken');
    throw e;
  }
}

export const ShowPatch = NewShow.omit({ slug: true, community: true }).partial().extend({ published: z.boolean().optional() });

export async function updateShow(q: Queryable, id: string, p: z.infer<typeof ShowPatch>): Promise<Show> {
  await get(q, id);
  await q.query(
    `update public.podcast_shows set title = coalesce($2, title), description = coalesce($3, description), author = coalesce($4, author),
            image_url = case when $5 then $6 else image_url end, category = coalesce($7, category), published = coalesce($8, published)
      where id = $1`,
    [id, p.title ?? null, p.description ?? null, p.author ?? null, p.imageUrl !== undefined, p.imageUrl ?? null, p.category ?? null, p.published ?? null],
  );
  return get(q, id);
}

export const NewEpisode = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(''),
  audioUrl: https,
  /** The file's size in bytes (the feed needs it). Left out: the server asks the audio host. */
  audioBytes: z.number().int().min(0).optional(),
  audioType: z.enum(['audio/mpeg', 'audio/x-m4a', 'audio/mp4', 'audio/aac']).optional(),
  durationSeconds: z.number().int().positive().max(86_400).nullable().optional(),
  episodeNumber: z.number().int().positive().nullable().optional(),
  /** True: published now. */
  publish: z.boolean().default(false),
});

const TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/x-m4a', mp4: 'audio/mp4', aac: 'audio/aac' };

/** The audio file's size and type from its host (a HEAD request), when the admin didn't give them. */
async function probe(url: string, fetcher: typeof fetch): Promise<{ bytes: number; type: string | null }> {
  try {
    const res = await fetcher(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(5000) });
    const bytes = Number(res.headers.get('content-length') ?? 0);
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
    return { bytes: Number.isFinite(bytes) ? bytes : 0, type };
  } catch {
    return { bytes: 0, type: null };
  }
}

export async function addEpisode(q: Queryable, showId: string, input: z.infer<typeof NewEpisode>, fetcher: typeof fetch = fetch): Promise<Show> {
  await get(q, showId);
  const ext = new URL(input.audioUrl).pathname.split('.').pop()?.toLowerCase() ?? '';
  const probed = input.audioBytes === undefined || !input.audioType ? await probe(input.audioUrl, fetcher) : null;
  const type = input.audioType ?? (probed?.type && Object.values(TYPES).includes(probed.type) ? probed.type : TYPES[ext]);
  if (!type) throw badRequest('Use an MP3 or M4A audio file');
  try {
    await q.query(
      `insert into public.podcast_episodes (show_id, title, description, audio_url, audio_bytes, audio_type, duration_seconds, episode_number, published_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, case when $9 then now() end)`,
      [showId, input.title, input.description, input.audioUrl, input.audioBytes ?? probed?.bytes ?? 0, type, input.durationSeconds ?? null, input.episodeNumber ?? null, input.publish],
    );
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw conflict('This show already has an episode with that audio file');
    throw e;
  }
  return get(q, showId);
}

export const EpisodePatch = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  published: z.boolean().optional(),
});

export async function updateEpisode(q: Queryable, id: string, p: z.infer<typeof EpisodePatch>): Promise<Show> {
  const { rows } = await q.query<{ show_id: string }>(
    `update public.podcast_episodes set title = coalesce($2, title), description = coalesce($3, description),
            published_at = case when $4::boolean is null then published_at when $4 then coalesce(published_at, now()) else null end
      where id = $1 returning show_id`,
    [id, p.title ?? null, p.description ?? null, p.published ?? null],
  );
  if (!rows[0]) throw notFound('Episode');
  return get(q, rows[0].show_id);
}

export async function removeEpisode(q: Queryable, id: string): Promise<Show> {
  const { rows } = await q.query<{ show_id: string }>('delete from public.podcast_episodes where id = $1 returning show_id', [id]);
  if (!rows[0]) throw notFound('Episode');
  return get(q, rows[0].show_id);
}

// RSS ------------------------------------------------------------------------------

/** XML text: escape &, <, > and quotes (Apple: use &apos; and &quot;). */
export const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** RFC 2822 date, which Apple requires for pubDate. */
const rfc2822 = (iso: string) => new Date(iso).toUTCString().replace('GMT', '+0000');

/** The public RSS 2.0 feed of a published show, or null (switched off, unknown or not published). */
export async function feed(q: Queryable, slug: string, siteUrl: string): Promise<string | null> {
  if (!(await enabled(q))) return null;
  const { rows } = await q.query<Show>(`select ${SHOW(true)} ${FROM} where s.slug = $1 and s.published`, [slug]);
  const s = rows[0];
  if (!s) return null;
  const [top, sub] = s.category.split(' > ');
  const category = sub ? `<itunes:category text="${xml(top!)}"><itunes:category text="${xml(sub)}"/></itunes:category>` : `<itunes:category text="${xml(top!)}"/>`;
  const items = s.episodes
    .map(
      (e) => `    <item>
      <title>${xml(e.title)}</title>
      <description>${xml(e.description)}</description>
      <enclosure url="${xml(e.audioUrl)}" length="${e.audioBytes}" type="${xml(e.audioType)}"/>
      <guid isPermaLink="false">${e.guid}</guid>
      <pubDate>${rfc2822(e.publishedAt!)}</pubDate>${e.durationSeconds ? `\n      <itunes:duration>${e.durationSeconds}</itunes:duration>` : ''}${e.episodeNumber ? `\n      <itunes:episode>${e.episodeNumber}</itunes:episode>` : ''}
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${xml(s.title)}</title>
    <link>${xml(siteUrl)}</link>
    <language>en-us</language>
    <copyright>&#xA9; ${new Date().getUTCFullYear()} ${xml(s.author)}</copyright>
    <itunes:author>${xml(s.author)}</itunes:author>
    <description>${xml(s.description)}</description>
    <itunes:type>episodic</itunes:type>${s.imageUrl ? `\n    <itunes:image href="${xml(s.imageUrl)}"/>` : ''}
    ${category}
    <itunes:explicit>false</itunes:explicit>
${items}
  </channel>
</rss>
`;
}
