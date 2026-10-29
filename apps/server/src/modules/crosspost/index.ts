// Cross-posting (migration 20261029007000_crosspost.sql; docs/CROSSPOST.md). A
// member who posts on Facebook or Threads gets the same post, text and photos, on
// their own Prayer Tower account. Off until Admin → Notebook ideas turns it on;
// Admin → Communities can hide it for one community.
//
// Posts arrive two ways: the browser extension sends them the moment the member
// clicks Post (apps/extension), and a connected account is checked by the worker
// (meta.ts). Either way they go through importPost, which skips anything already
// copied and makes an ordinary post: the same safety checks and moderation scan.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { POST_TYPES } from '@prayer-tower/shared';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, forbidden } from '../../errors.js';
import { featureOn, isSecular } from '../communities/index.js';
import { neutralText } from '../communities/neutral-text.js';
import * as posts from '../posts/index.js';

export const SOURCES = ['facebook', 'threads'] as const;
export type Source = (typeof SOURCES)[number];
export type Via = 'extension' | 'account';

/** Photos and videos a copy can carry: the types the post-media bucket accepts. */
export const MEDIA_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
} as const;
export type MediaType = keyof typeof MEDIA_TYPES;
export const MAX_MEDIA = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const kindOf = (t: MediaType): 'image' | 'video' => (t.startsWith('video/') ? 'video' : 'image');
export const maxBytes = (t: MediaType) => (kindOf(t) === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);

/** Saves one photo or video under the member's media folder; returns its storage path (<user id>/<uuid>.<ext>). */
export type MediaStore = (userId: string, bytes: Buffer, contentType: MediaType) => Promise<string>;

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ on: boolean }>('select crosspost_enabled as on from public.notebook_settings');
  return rows[0]?.on === true;
}

/** On for this member: the switch is on and their community hasn't hidden it. */
export async function available(q: Queryable, userId: string): Promise<boolean> {
  return (await enabled(q)) && (await featureOn(q, userId, 'crosspost'));
}

async function requireAvailable(q: Queryable, userId: string) {
  if (!(await available(q, userId))) throw forbidden('Cross-posting is not available');
}

// Member settings and the extension key ----------------------------------------------

interface SettingsRow {
  post_type: string | null;
  paused: boolean;
  extension_key_hint: string | null;
}

async function settingsOf(q: Queryable, userId: string): Promise<SettingsRow> {
  const { rows } = await q.query<SettingsRow>('select post_type, paused, extension_key_hint from public.crosspost_settings where user_id = $1', [userId]);
  return rows[0] ?? { post_type: null, paused: false, extension_key_hint: null };
}

/** The post types the member's community has, in the order the app offers them. */
async function communityPostTypes(q: Queryable, userId: string): Promise<string[]> {
  const { rows } = await q.query<{ types: string[] }>(
    'select enabled_post_types::text[] as types from public.communities where id = public.member_community_id($1)',
    [userId],
  );
  return POST_TYPES.filter((t) => rows[0]?.types.includes(t));
}

/** What copies become: the member's choice if their community still has it, else discussion, else testimony. */
async function postTypeFor(q: Queryable, userId: string, chosen: string | null): Promise<posts.PostType> {
  const types = await communityPostTypes(q, userId);
  for (const t of [chosen, 'discussion', 'testimony', 'praise']) if (t && types.includes(t)) return t as posts.PostType;
  if (!types[0]) throw badRequest('Your community has no kinds of post');
  return types[0] as posts.PostType;
}

export const SettingsPatch = z.object({
  postType: z.enum(POST_TYPES).nullable().optional(),
  paused: z.boolean().optional(),
});

export async function updateSettings(q: Queryable, userId: string, p: z.infer<typeof SettingsPatch>) {
  await requireAvailable(q, userId);
  if (p.postType && !(await communityPostTypes(q, userId)).includes(p.postType)) throw badRequest('That kind of post is not available in your community');
  await q.query(
    `insert into public.crosspost_settings (user_id, post_type, paused) values ($1, $2, coalesce($3, false))
     on conflict (user_id) do update set
       post_type = case when $4 then excluded.post_type else crosspost_settings.post_type end,
       paused = coalesce($3, crosspost_settings.paused), updated_at = now()`,
    [userId, p.postType ?? null, p.paused ?? null, p.postType !== undefined],
  );
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** A new key for the browser extension; any earlier key stops working. Shown to the member once. */
export async function newExtensionKey(q: Queryable, userId: string): Promise<string> {
  await requireAvailable(q, userId);
  const key = `ptx_${randomBytes(32).toString('base64url')}`;
  await q.query(
    `insert into public.crosspost_settings (user_id, extension_key_hash, extension_key_hint) values ($1, $2, $3)
     on conflict (user_id) do update set extension_key_hash = excluded.extension_key_hash, extension_key_hint = excluded.extension_key_hint, updated_at = now()`,
    [userId, hashKey(key), key.slice(-4)],
  );
  return key;
}

export async function revokeExtensionKey(q: Queryable, userId: string) {
  await q.query('update public.crosspost_settings set extension_key_hash = null, extension_key_hint = null, updated_at = now() where user_id = $1', [userId]);
}

/** The member an extension key belongs to, or null. */
export async function userForExtensionKey(q: Queryable, key: string | undefined): Promise<string | null> {
  if (!key || !/^ptx_[A-Za-z0-9_-]{43}$/.test(key)) return null;
  const { rows } = await q.query<{ user_id: string }>('select user_id from public.crosspost_settings where extension_key_hash = $1', [hashKey(key)]);
  return rows[0]?.user_id ?? null;
}

// Status for the app ---------------------------------------------------------------

export interface Status {
  enabled: boolean;
  /** Which "Connect" buttons work on this server (their Meta app keys are set). */
  connectable: Record<Source, boolean>;
  accounts: { provider: Source; username: string | null; status: 'active' | 'expired'; connectedAt: Date; lastCheckedAt: Date | null }[];
  postType: string | null;
  postTypes: string[];
  paused: boolean;
  extensionKeyHint: string | null;
  recent: { source: Source; via: Via; status: 'posted' | 'skipped'; reason: string | null; postId: string | null; permalink: string | null; createdAt: Date }[];
}

export async function status(q: Queryable, userId: string, connectable: Record<Source, boolean>): Promise<Status> {
  if (!(await available(q, userId))) {
    return { enabled: false, connectable: { facebook: false, threads: false }, accounts: [], postType: null, postTypes: [], paused: false, extensionKeyHint: null, recent: [] };
  }
  const s = await settingsOf(q, userId);
  const { rows: accounts } = await q.query<Status['accounts'][number]>(
    `select provider, username, status, created_at as "connectedAt", last_checked_at as "lastCheckedAt"
       from public.crosspost_accounts where user_id = $1 order by provider`,
    [userId],
  );
  const { rows: recent } = await q.query<Status['recent'][number]>(
    `select source, via, status, reason, post_id as "postId", permalink, created_at as "createdAt"
       from public.crosspost_imports where user_id = $1 order by created_at desc, id desc limit 20`,
    [userId],
  );
  return {
    enabled: true,
    connectable,
    accounts,
    postType: s.post_type,
    postTypes: await communityPostTypes(q, userId),
    paused: s.paused,
    extensionKeyHint: s.extension_key_hint,
    // Why a post wasn't copied repeats a posting check's message; Open Circle members read it in neutral words.
    recent: (await isSecular(q, userId)) ? recent.map((r) => ({ ...r, reason: r.reason && neutralText(r.reason) })) : recent,
  };
}

// Bringing a post in ---------------------------------------------------------------

export interface Incoming {
  source: Source;
  via: Via;
  /** The post's id on Facebook or Threads; the extension, which can't know it, sends a hash of the text. */
  externalId: string;
  text: string;
  permalink?: string | null;
  media?: { bytes: Buffer; contentType: MediaType }[];
}

export type ImportResult = { status: 'posted'; postId: string } | { status: 'skipped'; reason: string } | { status: 'duplicate' };

/** Collapses spacing so the same post seen by the extension and by a connected account matches. */
export const bodyHash = (text: string) => createHash('sha256').update(text.replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex');

/** Keep within the post limits (posts.NewPost): 1,000 words and 10,000 characters. */
export function fitBody(text: string): string {
  let body = text.trim();
  const words = body.split(/\s+/);
  if (words.length > 1000) body = `${words.slice(0, 999).join(' ')} …`;
  if (body.length > 10_000) body = `${body.slice(0, 9_998)} …`;
  return body;
}

/**
 * Make one Prayer Tower post from a Facebook or Threads post. Run inside a
 * transaction. Skipped (and recorded, so it isn't tried again) when cross-posting
 * is paused or off, when the same text came in during the last three days, when
 * there is nothing to post, or when the usual posting checks refuse it.
 */
export async function importPost(q: Queryable, userId: string, item: Incoming, storeMedia: MediaStore | null): Promise<ImportResult> {
  const { rowCount: seen } = await q.query('select 1 from public.crosspost_imports where user_id = $1 and source = $2 and external_id = $3', [
    userId,
    item.source,
    item.externalId,
  ]);
  if (seen) return { status: 'duplicate' };
  // The webhook, the 5-minute check and the extension can all bring in the same post at
  // once. One import per member at a time, so the checks below see each other's copies.
  await q.query("select pg_advisory_xact_lock(hashtextextended('crosspost:' || $1, 0))", [userId]);
  const { rowCount: seenNow } = await q.query('select 1 from public.crosspost_imports where user_id = $1 and source = $2 and external_id = $3', [
    userId,
    item.source,
    item.externalId,
  ]);
  if (seenNow) return { status: 'duplicate' };
  const hash = bodyHash(item.text);
  const record = (status: 'posted' | 'skipped', postId: string | null, reason: string | null) =>
    q.query(
      `insert into public.crosspost_imports (user_id, source, via, external_id, body_hash, permalink, post_id, status, reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (user_id, source, external_id) do nothing`,
      [userId, item.source, item.via, item.externalId, hash, item.permalink?.startsWith('https://') ? item.permalink : null, postId, status, reason],
    );
  const skip = async (reason: string): Promise<ImportResult> => {
    await record('skipped', null, reason);
    return { status: 'skipped', reason };
  };

  if (!(await available(q, userId))) return skip('Cross-posting is off');
  const s = await settingsOf(q, userId);
  if (s.paused) return skip('Paused');
  const files = (item.media ?? []).filter((m) => m.bytes.length <= maxBytes(m.contentType)).slice(0, MAX_MEDIA);
  const body = fitBody(item.text);
  if (!body && files.length === 0) return skip('Nothing to post');
  if (body) {
    const { rowCount: dup } = await q.query(
      `select 1 from public.crosspost_imports where user_id = $1 and body_hash = $2 and status = 'posted' and created_at > now() - interval '3 days'`,
      [userId, hash],
    );
    if (dup) return skip('Already copied');
  }

  const postType = await postTypeFor(q, userId, s.post_type);
  await q.query('savepoint crosspost_import');
  try {
    const media: { kind: 'image' | 'video'; storagePath: string }[] = [];
    if (storeMedia) for (const f of files) media.push({ kind: kindOf(f.contentType), storagePath: await storeMedia(userId, f.bytes, f.contentType) });
    // A post needs words; a photo- or video-only post gets a short caption.
    const input = posts.NewPost.parse({ postType, body: body || caption(media.map((m) => m.kind)), media });
    const post = await posts.create(q, userId, input);
    await q.query('release savepoint crosspost_import');
    await record('posted', post.id, null);
    return { status: 'posted', postId: post.id };
  } catch (err) {
    await q.query('rollback to savepoint crosspost_import');
    // A refusal the member would see when posting (flood, new-member limits) is recorded; anything else is retried.
    if (err instanceof AppError && err.statusCode < 500) return skip(err.message);
    if (err instanceof z.ZodError) return skip('Not a valid post');
    throw err;
  }
}

function caption(kinds: ('image' | 'video')[]) {
  if (kinds.length === 0) return 'Shared from my other account';
  if (kinds.every((k) => k === 'video')) return kinds.length > 1 ? 'Videos' : 'Video';
  if (kinds.every((k) => k === 'image')) return kinds.length > 1 ? 'Photos' : 'Photo';
  return 'Photos and video';
}

/** A MediaStore that writes to Supabase Storage (the post-media bucket). */
export function storageMediaStore(upload: (path: string, bytes: Buffer, contentType: string) => Promise<void>): MediaStore {
  return async (userId, bytes, contentType) => {
    const path = `${userId}/${randomUUID()}.${MEDIA_TYPES[contentType]}`;
    await upload(path, bytes, contentType);
    return path;
  };
}

/** The photo or video type from a file's first bytes (never trust the declared type). */
export function sniffMedia(bytes: Buffer): MediaType | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (/^(heic|heix|mif1|msf1)$/.test(brand)) return 'image/heic';
    if (brand === 'qt  ') return 'video/quicktime';
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |dash)$/.test(brand)) return 'video/mp4';
  }
  return null;
}
