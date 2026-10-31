// Quick reactions: long-press a post for "Light a candle" 🕯️ or "Standing with you" ❤️
// (Project Management Document 3.8). Off until an admin turns on reaction_tray_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { getActionable } from '../posts/index.js';

export const QUICK_REACTIONS = ['candle', 'standing', 'thumbs_up'] as const;
export const QuickReaction = z.enum(QUICK_REACTIONS);

async function requireOn(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select reaction_tray_enabled as on from public.notebook_settings');
  if (!rows[0]?.on) throw badRequest('Quick reactions are switched off');
}

/** Adds or removes the member's reaction; returns the post's counts and the member's own reactions. */
export async function set(q: Queryable, userId: string, postId: string, kind: z.infer<typeof QuickReaction>, on: boolean) {
  // Thumbs up is on every post's icon row, so it never waits on the long-press tray's switch.
  if (kind !== 'thumbs_up') await requireOn(q);
  if (!(await getActionable(q, userId, postId))) throw notFound('Post');
  if (on) {
    await q.query('insert into public.quick_reactions (post_id, user_id, kind) values ($1, $2, $3) on conflict do nothing', [postId, userId, kind]);
  } else {
    await q.query('delete from public.quick_reactions where post_id = $1 and user_id = $2 and kind = $3', [postId, userId, kind]);
  }
  return summary(q, postId, userId);
}

export async function summary(q: Queryable, postId: string, userId: string) {
  const { rows } = await q.query<{ kind: string; n: number; mine: boolean }>(
    `select kind, count(*)::int as n, bool_or(user_id = $2) as mine from public.quick_reactions where post_id = $1 group by kind`,
    [postId, userId],
  );
  const by = new Map(rows.map((r) => [r.kind, r]));
  return {
    candles: by.get('candle')?.n ?? 0,
    standing: by.get('standing')?.n ?? 0,
    thumbsUp: by.get('thumbs_up')?.n ?? 0,
    mine: QUICK_REACTIONS.filter((k) => by.get(k)?.mine),
  };
}
