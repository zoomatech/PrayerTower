// A path back after a removal (research/Conflict_Repair_and_Newcomer_Kindness.md, suggestion 5):
// when a moderator removes a post or comment, the notice says how to post again, and the author
// (only the author) can get their own removed words back to change and share again. It is never
// offered for threats, flooding or automated accounts. Switch: practice_settings.path_back_enabled.
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { settings } from '../practices/index.js';

/** Rules where trying again with kinder or safer words makes sense. */
const REPAIRABLE = new Set(['abuse', 'safe_messaging', 'pressure', 'misleading', 'ads', 'other']);

export const NOTICE_LINE = ' You’re welcome to post it again with changes: open Notices and choose “Post again with changes”.';

/** Should this removal notice offer the way back? */
export async function applies(q: Queryable, target: string, rule: string | null) {
  return (target === 'post' || target === 'comment') && !!rule && REPAIRABLE.has(rule) && (await settings(q)).path_back_enabled;
}

/** The author's own removed words, to edit and post again. Nobody else can read them here. */
export async function words(q: Queryable, userId: string, itemId: string) {
  if (!(await settings(q)).path_back_enabled) throw badRequest('Posting again after a removal is switched off');
  const { rows } = await q.query<{ target_type: string; target_id: string; rule: string | null }>(
    `select target_type, target_id, rule from public.moderation_items
      where id = $1 and user_id = $2 and status = 'actioned' and target_type in ('post', 'comment')`,
    [itemId, userId],
  );
  const item = rows[0];
  if (!item || !item.rule || !REPAIRABLE.has(item.rule)) throw notFound('Removed words');
  if (item.target_type === 'post') {
    const { rows: p } = await q.query<{ body: string; post_type: string }>(
      "select body, post_type from public.posts where id = $1 and user_id = $2 and moderation_status = 'removed'",
      [item.target_id, userId],
    );
    if (!p[0]) throw notFound('Removed words');
    return { target: 'post' as const, body: p[0].body, postType: p[0].post_type };
  }
  const { rows: c } = await q.query<{ body: string; post_id: string }>(
    "select body, post_id from public.comments where id = $1 and user_id = $2 and moderation_status = 'removed'",
    [item.target_id, userId],
  );
  if (!c[0]) throw notFound('Removed words');
  return { target: 'comment' as const, body: c[0].body, postId: c[0].post_id };
}
