// Comment kindness (docs/CONVERSATION_HELPERS.md), from research/Kind_Interaction_UX_Research.md:
// the asker's heart on a comment (YouTube creator hearts), a private thank-you for a
// comment (Wikipedia Thanks), and quiet counts (Instagram's hide-likes choice). No
// public numbers anywhere. Switches in conversation_settings, all off.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';

async function switches(q: Queryable) {
  const { rows } = await q.query<{ author_hearts_enabled: boolean; comment_thanks_enabled: boolean; quiet_counts_enabled: boolean }>(
    'select author_hearts_enabled, comment_thanks_enabled, quiet_counts_enabled from public.conversation_settings',
  );
  return rows[0]!;
}

/** A visible comment, with whose it is and whose post it's on. */
async function comment(q: Queryable, commentId: string) {
  const { rows } = await q.query<{ id: string; post_id: string; user_id: string; post_author: string }>(
    `select c.id, c.post_id, c.user_id, p.user_id as post_author
       from public.comments c join public.posts p on p.id = c.post_id
      where c.id = $1 and c.moderation_status = 'visible' and p.moderation_status = 'visible'`,
    [commentId],
  );
  if (!rows[0]) throw notFound('Comment');
  return rows[0];
}

/** On a post: which comments the asker loved, and which the viewer has thanked. */
export async function forPost(q: Queryable, viewerId: string, postId: string) {
  const s = await switches(q);
  const { rows: hearts } = s.author_hearts_enabled
    ? await q.query<{ comment_id: string }>('select h.comment_id from public.comment_hearts h join public.comments c on c.id = h.comment_id where c.post_id = $1', [postId])
    : { rows: [] };
  const { rows: thanked } = s.comment_thanks_enabled
    ? await q.query<{ comment_id: string }>(
        'select t.comment_id from public.comment_thanks t join public.comments c on c.id = t.comment_id where c.post_id = $1 and t.from_id = $2',
        [postId, viewerId],
      )
    : { rows: [] };
  return { hearts: hearts.map((h) => h.comment_id), thanked: thanked.map((t) => t.comment_id) };
}

export const HeartPatch = z.object({ on: z.boolean() });

/** The asker hearts (or un-hearts) a comment on their post. The commenter hears once, quietly. */
export async function heart(q: Queryable, userId: string, commentId: string, on: boolean) {
  if (!(await switches(q)).author_hearts_enabled) throw badRequest("The asker's heart is switched off");
  const c = await comment(q, commentId);
  if (c.post_author !== userId) throw forbidden('Only the person who asked can heart a comment');
  if (c.user_id === userId) throw badRequest('That is your own comment');
  if (await posts.blockedBetween(q, userId, c.user_id)) throw notFound('Comment');
  if (!on) {
    await q.query('delete from public.comment_hearts where comment_id = $1', [commentId]);
    return { on: false };
  }
  const { rowCount } = await q.query('insert into public.comment_hearts (comment_id) values ($1) on conflict do nothing', [commentId]);
  if (rowCount) {
    await notifications.notify(q, c.user_id, {
      kind: 'author_heart',
      title: 'Your words meant something',
      body: 'The person who asked loved your comment. ❤️',
      data: { postId: c.post_id, commentId },
      dedupeKey: `author_heart:${commentId}`,
      quiet: true,
    });
  }
  return { on: true };
}

/** Any member thanks someone for a comment, once. Only the commenter hears; nothing is counted in public. */
export async function thank(q: Queryable, userId: string, commentId: string) {
  if (!(await switches(q)).comment_thanks_enabled) throw badRequest('Thanks for comments are switched off');
  const c = await comment(q, commentId);
  if (c.user_id === userId) throw badRequest('That is your own comment');
  // Only on a post they may act on, and never between people where either blocked the other.
  if (!(await posts.getActionable(q, userId, c.post_id)) || (await posts.blockedBetween(q, userId, c.user_id))) throw notFound('Comment');
  const { rowCount } = await q.query('insert into public.comment_thanks (comment_id, from_id) values ($1, $2) on conflict do nothing', [commentId, userId]);
  if (!rowCount) throw conflict('You already thanked them');
  const who = (await getProfile(q, userId))?.display_name || 'Someone';
  await notifications.notify(q, c.user_id, {
    kind: 'comment_thanks',
    title: `${who} thanked you`,
    body: `${who} thanked you for your comment.`,
    data: { postId: c.post_id, commentId },
    dedupeKey: `comment_thanks:${commentId}:${userId}`,
    quiet: true,
  });
  return { thanked: true };
}

// Quiet counts ------------------------------------------------------------------------

export const QuietPatch = z.object({ hideSeen: z.boolean().optional(), hideMine: z.boolean().optional() });

export async function quietPrefs(q: Queryable, userId: string) {
  const enabled = (await switches(q)).quiet_counts_enabled;
  const { rows } = await q.query<{ hide_seen: boolean; hide_mine: boolean }>('select hide_seen, hide_mine from public.quiet_count_prefs where user_id = $1', [userId]);
  return { enabled, hideSeen: enabled && (rows[0]?.hide_seen ?? false), hideMine: enabled && (rows[0]?.hide_mine ?? false) };
}

export async function setQuietPrefs(q: Queryable, userId: string, p: z.infer<typeof QuietPatch>) {
  if (!(await switches(q)).quiet_counts_enabled) throw badRequest('Quiet counts are switched off');
  await q.query(
    `insert into public.quiet_count_prefs (user_id, hide_seen, hide_mine) values ($1, coalesce($2, false), coalesce($3, false))
     on conflict (user_id) do update set hide_seen = coalesce($2, quiet_count_prefs.hide_seen), hide_mine = coalesce($3, quiet_count_prefs.hide_mine)`,
    [userId, p.hideSeen ?? null, p.hideMine ?? null],
  );
  return quietPrefs(q, userId);
}
