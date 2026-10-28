// Spoken prayers (unbuilt-ideas inventory: "Paid spoken-audio prayer"; Steve's
// work order 2026-10-28: "free, with an optional token offer"). A member who
// prayed for a request records a short voice prayer for the person who asked.
// Off by default (Admin → Spoken prayers). The requester turns them on per
// request and may offer tokens; the offer is paid from the requester's own
// balance when they first listen, so it never pays for a recording nobody heard.
// Audio sits in a private bucket and plays through short-lived signed URLs.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as tokens from '../tokens/index.js';

export const SPOKEN_BUCKET = 'spoken-prayers';
const READ_URL_SECONDS = 60 * 60;
export const AUDIO_EXT = { 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/wav': 'wav' } as const;

export interface Settings {
  enabled: boolean;
  max_seconds: number;
  max_offer_tokens: number;
}

export async function settings(q: Queryable): Promise<Settings> {
  const { rows } = await q.query<Settings>('select enabled, max_seconds, max_offer_tokens from public.spoken_prayer_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  maxSeconds: z.number().int().min(10).max(300).optional(),
  maxOfferTokens: z.number().int().min(0).max(1000).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>): Promise<Settings> {
  const { rows } = await q.query<Settings>(
    `update public.spoken_prayer_settings set enabled = coalesce($1, enabled), max_seconds = coalesce($2, max_seconds),
            max_offer_tokens = coalesce($3, max_offer_tokens)
      returning enabled, max_seconds, max_offer_tokens`,
    [p.enabled ?? null, p.maxSeconds ?? null, p.maxOfferTokens ?? null],
  );
  return rows[0]!;
}

async function requireOn(q: Queryable): Promise<Settings> {
  const s = await settings(q);
  if (!s.enabled) throw new AppError(404, 'feature_off', 'Spoken prayers are not turned on');
  return s;
}

// The requester's choice -----------------------------------------------------------

export const Invite = z.object({ offerTokens: z.number().int().min(0).max(1000).default(0) });

/** The requester turns spoken prayers on for their own request, with an optional token offer. */
export async function invite(q: Queryable, userId: string, postId: string, input: z.infer<typeof Invite>) {
  const s = await requireOn(q);
  const post = await posts.getVisible(q, postId);
  if (!post || post.user_id !== userId) throw notFound('Request');
  posts.requirePrayable(post);
  if (input.offerTokens > s.max_offer_tokens) throw badRequest(`The most you can offer is ${s.max_offer_tokens} tokens`);
  await q.query(
    `insert into public.spoken_prayer_invites (post_id, user_id, offer_tokens) values ($1, $2, $3)
     on conflict (post_id) do update set offer_tokens = excluded.offer_tokens`,
    [postId, userId, input.offerTokens],
  );
  return { invited: true, offerTokens: input.offerTokens };
}

export async function uninvite(q: Queryable, userId: string, postId: string) {
  await q.query('delete from public.spoken_prayer_invites where post_id = $1 and user_id = $2', [postId, userId]);
  return { invited: false };
}

async function inviteFor(q: Queryable, postId: string) {
  const { rows } = await q.query<{ offer_tokens: number }>('select offer_tokens from public.spoken_prayer_invites where post_id = $1', [postId]);
  return rows[0] ?? null;
}

/** Someone may send one only after praying for the request, and never across a block. */
async function senderCheck(q: Queryable, userId: string, postId: string) {
  const post = await posts.getActionable(q, userId, postId);
  if (!post) throw notFound('Request');
  if (post.user_id === userId) throw badRequest('You cannot send a spoken prayer on your own request');
  const inv = await inviteFor(q, postId);
  if (!inv) throw forbidden('This person has not asked for spoken prayers');
  const { rowCount } = await q.query('select 1 from public.prayer_events where post_id = $1 and user_id = $2 limit 1', [postId, userId]);
  if (!rowCount) throw forbidden('Pray for this request first, then you can record a spoken prayer');
  return { post, offer: inv.offer_tokens };
}

// Recording ---------------------------------------------------------------------

export const UploadRequest = z.object({ contentType: z.enum(Object.keys(AUDIO_EXT) as [keyof typeof AUDIO_EXT]) });

export async function uploadUrl(q: Queryable, storage: SupabaseClient | null, userId: string, postId: string, input: z.infer<typeof UploadRequest>) {
  await requireOn(q);
  await senderCheck(q, userId, postId);
  if (!storage) throw new AppError(503, 'storage_unavailable', 'Audio storage is not configured');
  const path = `${userId}/${randomUUID()}.${AUDIO_EXT[input.contentType]}`;
  const { data, error } = await storage.storage.from(SPOKEN_BUCKET).createSignedUploadUrl(path);
  if (error) throw new AppError(502, 'storage_error', error.message);
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export const NewSpoken = z.object({
  storagePath: z.string().min(1).max(300),
  durationSeconds: z.number().int().min(1).max(300),
});

export async function create(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewSpoken>) {
  const s = await requireOn(q);
  const { post, offer } = await senderCheck(q, userId, postId);
  if (!input.storagePath.startsWith(`${userId}/`)) throw badRequest('That recording is not yours');
  if (input.durationSeconds > s.max_seconds) throw badRequest(`Spoken prayers can be up to ${s.max_seconds} seconds`);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.spoken_prayers (post_id, user_id, recipient_id, community_id, storage_path, duration_seconds, offer_tokens)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (post_id, user_id) do nothing returning id`,
    [postId, userId, post.user_id, post.community_id, input.storagePath, input.durationSeconds, offer],
  );
  if (!rows[0]) throw conflict('You already sent a spoken prayer for this request');
  const { rows: who } = await q.query<{ display_name: string }>('select display_name from public.profiles where id = $1', [userId]);
  const name = who[0]?.display_name || 'Someone';
  await notifications.notify(q, post.user_id, {
    kind: 'spoken_prayer',
    title: `${name} recorded a prayer for you`,
    body: 'Open your request to listen.',
    data: { postId, spokenPrayerId: rows[0].id },
    dedupeKey: `spoken_prayer:${rows[0].id}`,
    t: { key: 'spoken_prayer', params: { who: name } },
  });
  return { id: rows[0].id, offerTokens: offer };
}

// Listening ---------------------------------------------------------------------

interface Row {
  id: string;
  user_id: string;
  recipient_id: string;
  storage_path: string;
  duration_seconds: number;
  offer_tokens: number;
  paid_transfer_id: string | null;
  listened_at: Date | null;
  created_at: Date;
  name: string | null;
}

async function signed(storage: SupabaseClient | null, paths: string[]): Promise<Map<string, string>> {
  if (!storage || !paths.length) return new Map();
  const { data } = await storage.storage.from(SPOKEN_BUCKET).createSignedUrls(paths, READ_URL_SECONDS);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as [string, string]] : [])));
}

const shape = (r: Row, urls: Map<string, string>) => ({
  id: r.id,
  from: { id: r.user_id, displayName: r.name ?? 'Someone' },
  durationSeconds: r.duration_seconds,
  offerTokens: r.offer_tokens,
  paid: !!r.paid_transfer_id,
  listened: !!r.listened_at,
  createdAt: r.created_at,
  url: urls.get(r.storage_path) ?? null,
});

/**
 * For the requester: what they turned on and every visible spoken prayer received.
 * For anyone else: whether they may send one, the offer, and whether they already did.
 */
export async function forPost(q: Queryable, storage: SupabaseClient | null, viewerId: string, postId: string) {
  const s = await settings(q);
  const post = await posts.getActionable(q, viewerId, postId);
  if (!post) throw notFound('Request');
  if (!s.enabled) return { enabled: false as const };
  const inv = await inviteFor(q, postId);
  if (post.user_id === viewerId) {
    const { rows } = await q.query<Row>(
      `select sp.*, p.display_name as name from public.spoken_prayers sp join public.profiles p on p.id = sp.user_id
        where sp.post_id = $1 and sp.moderation_status = 'visible'
          and not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = sp.user_id)
        order by sp.id desc`,
      [postId, viewerId],
    );
    const urls = await signed(storage, rows.map((r) => r.storage_path));
    return { enabled: true as const, mine: true, invited: !!inv, offerTokens: inv?.offer_tokens ?? 0, maxSeconds: s.max_seconds, maxOfferTokens: s.max_offer_tokens, received: rows.map((r) => shape(r, urls)) };
  }
  const { rowCount: sent } = await q.query('select 1 from public.spoken_prayers where post_id = $1 and user_id = $2', [postId, viewerId]);
  const { rowCount: prayed } = await q.query('select 1 from public.prayer_events where post_id = $1 and user_id = $2 limit 1', [postId, viewerId]);
  return { enabled: true as const, mine: false, invited: !!inv, offerTokens: inv?.offer_tokens ?? 0, maxSeconds: s.max_seconds, sent: !!sent, prayed: !!prayed };
}

/** The requester listened: mark it, and pay the offer once if their balance covers it. */
export async function listened(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<Row>(
    `select sp.*, null as name from public.spoken_prayers sp where sp.id = $1 and sp.recipient_id = $2 and sp.moderation_status = 'visible' for update`,
    [id, userId],
  );
  const r = rows[0];
  if (!r) throw notFound('Spoken prayer');
  if (!r.listened_at) await q.query('update public.spoken_prayers set listened_at = now() where id = $1', [id]);
  let paid = !!r.paid_transfer_id;
  let short = false;
  if (!paid && r.offer_tokens > 0) {
    // Checked first: a refused ledger write would end the whole transaction.
    if ((await tokens.balanceOf(q, userId)) >= r.offer_tokens && !(await posts.blockedBetween(q, userId, r.user_id))) {
      const t = await tokens.gift(q, userId, r.user_id, r.offer_tokens, `spoken:${id}`);
      await q.query('update public.spoken_prayers set paid_transfer_id = $2 where id = $1', [id, t.id]);
      paid = true;
    } else short = true;
  }
  return { listened: true, paid, notEnoughTokens: short };
}

/** The sender or the requester removes it (the audio file goes too). */
export async function remove(q: Queryable, storage: SupabaseClient | null, userId: string, id: string) {
  const { rows } = await q.query<{ storage_path: string }>(
    'delete from public.spoken_prayers where id = $1 and (user_id = $2 or recipient_id = $2) returning storage_path',
    [id, userId],
  );
  if (!rows[0]) throw notFound('Spoken prayer');
  if (storage) await storage.storage.from(SPOKEN_BUCKET).remove([rows[0].storage_path]);
  return { removed: true };
}

/** Moderators reviewing a report listen through a short-lived URL. */
export async function audioForStaff(q: Queryable, storage: SupabaseClient | null, id: string) {
  const { rows } = await q.query<{ storage_path: string }>('select storage_path from public.spoken_prayers where id = $1', [id]);
  if (!rows[0]) throw notFound('Spoken prayer');
  const urls = await signed(storage, [rows[0].storage_path]);
  return { url: urls.get(rows[0].storage_path) ?? null };
}

/** Only the two people involved can report one. */
export async function canSee(q: Queryable, userId: string, id: string): Promise<boolean> {
  const { rowCount } = await q.query('select 1 from public.spoken_prayers where id = $1 and (user_id = $2 or recipient_id = $2)', [id, userId]);
  return !!rowCount;
}
