// Giving split (migration 20261029056000_giving_split.sql, docs/GIVING_SPLIT.md):
// a member with an outside support page (Ko-fi, Zeffy and the like, profiles.support_url)
// may ask that a share of gifts toward them go to that page. The app never moves money:
// it shows the giver the page and the share, and a money gift through Give can be made
// smaller by that share. Anonymous posts never reveal whose page it is.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as posts from '../posts/index.js';

export interface SplitSettings {
  giving_split_enabled: boolean;
  max_percent: number;
}

export async function settings(q: Queryable): Promise<SplitSettings> {
  const { rows } = await q.query<SplitSettings>('select giving_split_enabled, max_percent from public.giving_split_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({ enabled: z.boolean().optional(), maxPercent: z.number().int().min(1).max(100).optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.giving_split_settings set giving_split_enabled = coalesce($1, giving_split_enabled), max_percent = coalesce($2, max_percent)`,
    [p.enabled ?? null, p.maxPercent ?? null],
  );
  // Nobody keeps a share above a lowered limit.
  if (p.maxPercent) await q.query('update public.profiles set giving_split_percent = $1 where giving_split_percent > $1', [p.maxPercent]);
  return settings(q);
}

export async function features(q: Queryable) {
  const s = await settings(q);
  return { givingSplit: s.giving_split_enabled, givingSplitMax: s.max_percent };
}

/** The member's own split. */
export async function mine(q: Queryable, userId: string) {
  const s = await settings(q);
  const { rows } = await q.query<{ giving_split_percent: number; support_url: string | null }>(
    'select giving_split_percent, support_url from public.profiles where id = $1',
    [userId],
  );
  return { enabled: s.giving_split_enabled, maxPercent: s.max_percent, percent: rows[0]?.giving_split_percent ?? 0, supportUrl: rows[0]?.support_url ?? null };
}

export const Choice = z.object({ percent: z.number().int().min(0).max(100) });

export async function setMine(q: Queryable, userId: string, percent: number) {
  const s = await settings(q);
  if (!s.giving_split_enabled) throw forbidden('Giving split is turned off for now');
  if (percent > s.max_percent) throw badRequest(`The most you can ask for is ${s.max_percent}%`);
  const { rows } = await q.query<{ support_url: string | null }>('select support_url from public.profiles where id = $1', [userId]);
  if (percent > 0 && !rows[0]?.support_url) throw badRequest('Add your support page (Ko-fi, Zeffy or similar) to your profile first');
  await q.query('update public.profiles set giving_split_percent = $2 where id = $1', [userId, percent]);
  return mine(q, userId);
}

export interface Split {
  /** The member's own page. */
  url: string;
  percent: number;
  /** The share of `cents`, when an amount was given. */
  shareCents: number | null;
}

async function splitFor(q: Queryable, viewerId: string, memberId: string, cents: number | null): Promise<Split | null> {
  if (!(await settings(q)).giving_split_enabled || viewerId === memberId) return null;
  const { rows } = await q.query<{ url: string; percent: number }>(
    `select p.support_url as url, p.giving_split_percent as percent
       from public.profiles p
      where p.id = $2 and p.deleted_at is null and p.support_url is not null and p.giving_split_percent > 0
        and public.member_community_id($1) is not distinct from public.member_community_id($2)`,
    [viewerId, memberId],
  );
  const r = rows[0];
  if (!r || (await posts.blockedBetween(q, viewerId, memberId))) return null;
  return { url: r.url, percent: r.percent, shareCents: cents === null ? null : Math.round((cents * r.percent) / 100) };
}

/** A member's split, as the giver sees it on Give. */
export async function forMember(q: Queryable, viewerId: string, memberId: string, cents: number | null) {
  return splitFor(q, viewerId, memberId, cents);
}

/** The split of a post's author, for a gift on that post. Never on an anonymous post. */
export async function forPost(q: Queryable, viewerId: string, postId: string) {
  const post = await posts.getViewable(q, viewerId, postId);
  if (!post) throw notFound('Post');
  if (post.is_anonymous) return null;
  return splitFor(q, viewerId, post.user_id, null);
}
