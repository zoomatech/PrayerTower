// Thank the pray-ers (docs/GROWTH_PRACTICES.md): the person who asked sends one warm note
// to everyone who prayed for their post. Gratitude letters lift the writer as well as the
// reader (research/Personal_Growth_Research.md, section 2). Each pray-er can answer with
// "Glad to"; only the asker sees how many did. Switch: practice_settings.thank_note_enabled.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import { settings } from '../practices/index.js';

export const NewThankNote = z.object({ body: z.string().trim().min(1).max(600) });

async function enabled(q: Queryable) {
  return (await settings(q)).thank_note_enabled;
}

/** The note on a post as the viewer may see it: the asker and those who prayed. */
export async function forPost(q: Queryable, viewerId: string, postId: string) {
  if (!(await enabled(q))) return { enabled: false as const, note: null, canWrite: false };
  const post = await posts.get(q, postId);
  if (!post || post.moderation_status !== 'visible') throw notFound('Post');
  const mine = post.user_id === viewerId;
  const prayed = mine ? [] : await posts.prayedBy(q, postId, post.user_id);
  const { rows } = await q.query<{ body: string; created_at: Date; glad: number; glad_by_me: boolean }>(
    `select n.body, n.created_at, (select count(*)::int from public.thank_note_glad g where g.post_id = n.post_id) as glad,
            exists (select 1 from public.thank_note_glad g where g.post_id = n.post_id and g.user_id = $2) as glad_by_me
       from public.thank_notes n where n.post_id = $1`,
    [postId, viewerId],
  );
  const n = rows[0];
  if (!mine && !prayed.includes(viewerId)) return { enabled: true as const, note: null, canWrite: false };
  const note = n ? { body: n.body, createdAt: n.created_at.toISOString(), gladByMe: n.glad_by_me, ...(mine ? { glad: n.glad } : {}) } : null;
  const canWrite = mine && !n && (await posts.prayedBy(q, postId, viewerId)).length > 0;
  return { enabled: true as const, note, canWrite };
}

/** Send the one note. Everyone who prayed or promised to pray hears once. */
export async function send(q: Queryable, userId: string, postId: string, body: string) {
  if (!(await enabled(q))) throw badRequest('Thank-you notes are switched off');
  const post = await posts.get(q, postId);
  if (!post || post.moderation_status !== 'visible') throw notFound('Post');
  if (post.user_id !== userId) throw forbidden('Only the person who asked can send it');
  const recipients = await posts.prayedBy(q, postId, userId);
  if (!recipients.length) throw badRequest('Nobody has prayed for this yet');
  const { rowCount } = await q.query('insert into public.thank_notes (post_id, user_id, body) values ($1, $2, $3) on conflict do nothing', [postId, userId, body]);
  if (!rowCount) throw conflict('You already sent your thank-you');
  const who = post.is_anonymous ? null : (await getProfile(q, userId))?.display_name || null;
  for (const r of recipients) {
    await notifications.notify(q, r, {
      kind: 'thank_note',
      title: who ? `A thank-you from ${who}` : 'A thank-you from someone you prayed for',
      body: body.length > 140 ? `${body.slice(0, 140)}…` : body,
      data: { postId },
      dedupeKey: `thank_note:${postId}`,
    });
  }
  return { sent: recipients.length };
}

/** A pray-er answers the note with "Glad to". The asker sees only how many. */
export async function glad(q: Queryable, userId: string, postId: string) {
  if (!(await enabled(q))) throw badRequest('Thank-you notes are switched off');
  const post = await posts.get(q, postId);
  if (!post) throw notFound('Post');
  if (!(await posts.prayedBy(q, postId, post.user_id)).includes(userId)) throw forbidden('Only those who prayed can answer');
  const { rowCount } = await q.query('select 1 from public.thank_notes where post_id = $1', [postId]);
  if (!rowCount) throw notFound('Thank-you note');
  await q.query('insert into public.thank_note_glad (post_id, user_id) values ($1, $2) on conflict do nothing', [postId, userId]);
  return { glad: true };
}
