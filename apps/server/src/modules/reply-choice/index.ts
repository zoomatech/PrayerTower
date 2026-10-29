// Who can reply (docs/CONVERSATION_HELPERS.md): the person who asked chooses who may comment
// on their post: everyone (the default), only people who prayed or supported it, or no
// comments at all, so prayers come without words to answer. Like X's and Threads' reply
// controls, it is the author's own choice, never a penalty. The author can always add updates.
// Switch: conversation_settings.reply_choice_enabled; while off, everyone can comment as before.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { settings } from '../conversation-helpers/index.js';
import * as posts from '../posts/index.js';

export const AUDIENCES = ['everyone', 'supporters', 'none'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const SetAudience = z.object({ audience: z.enum(AUDIENCES) });

async function enabled(q: Queryable) {
  return (await settings(q)).reply_choice_enabled;
}

async function supported(q: Queryable, userId: string, post: posts.PostRow) {
  if ((await posts.prayedBy(q, post.id, post.user_id)).includes(userId)) return true;
  const { rowCount } = await q.query('select 1 from public.reactions where post_id = $1 and user_id = $2', [post.id, userId]);
  return !!rowCount;
}

async function audienceOf(q: Queryable, postId: string): Promise<Audience> {
  const { rows } = await q.query<{ reply_audience: Audience }>('select reply_audience from public.posts where id = $1', [postId]);
  return rows[0]?.reply_audience ?? 'everyone';
}

/** May this member comment? While the switch is off, the choice is not applied. */
async function allowed(q: Queryable, userId: string, post: posts.PostRow, audience: Audience) {
  if (post.user_id === userId || audience === 'everyone') return true;
  if (audience === 'none') return false;
  return supported(q, userId, post);
}

/** The post's choice as the viewer sees it, and whether they may comment. */
export async function forPost(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) return { enabled: false as const, audience: 'everyone' as Audience, canComment: true, isMine: false };
  const post = await posts.getViewable(q, userId, postId);
  if (!post) throw notFound('Post');
  const audience = await audienceOf(q, postId);
  return { enabled: true as const, audience, canComment: await allowed(q, userId, post, audience), isMine: post.user_id === userId };
}

/** Called before a comment is added. Throws a gentle 403 when the author chose otherwise. */
export async function check(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) return;
  const post = await posts.get(q, postId);
  if (!post) return;
  const audience = await audienceOf(q, postId);
  if (!(await allowed(q, userId, post, audience))) {
    throw forbidden(audience === 'none' ? 'The person who asked would like prayers here, without comments' : 'The person who asked chose comments from people who prayed for this');
  }
}

/** Only the author sets it, and can change it any time. */
export async function set(q: Queryable, userId: string, postId: string, audience: Audience) {
  if (!(await enabled(q))) throw badRequest('Choosing who can reply is switched off');
  const post = await posts.get(q, postId);
  if (!post) throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the person who asked can choose');
  await q.query('update public.posts set reply_audience = $2 where id = $1', [postId, audience]);
  return forPost(q, userId, postId);
}
