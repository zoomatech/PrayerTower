// Gentle repair (docs/GENTLE_REPAIR.md; research/Conflict_Repair_and_Newcomer_Kindness.md).
// Each part is off until Admin → Growth practices turns it on (practice_settings):
//   1. Welcome card: shown before a member's first comment, until they dismiss it.
//   2. Ask kindly: someone hurt by a comment sends its author a polite, private,
//      unsigned note asking them to edit or remove it. Reporting stays separate.
//   3. Mend: only the hurt person invites a sorry. The author may write one in three
//      parts (what I did, that it's on me, what I'll do differently; no asking for
//      forgiveness). A moderator reads it before it's delivered. The hurt person can
//      accept it or close it quietly, and can withdraw at any time. Nothing depends on
//      it, it never crosses a block, and it's never offered for a comment held for harm.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { getProfile, hasRole } from '../accounts/index.js';
import { isBlocked } from '../messages/index.js';
import * as notifications from '../notifications/index.js';
import { settings } from '../practices/index.js';

// 1. Welcome card ----------------------------------------------------------------------

export async function welcomeCard(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.welcome_card_enabled) return { show: false, text: null };
  const { rows } = await q.query<{ show: boolean }>(
    `select not exists (select 1 from public.comments where user_id = $1)
        and not exists (select 1 from public.welcome_dismissed where user_id = $1) as show`,
    [userId],
  );
  return { show: rows[0]!.show, text: s.welcome_text };
}

export async function dismissWelcome(q: Queryable, userId: string) {
  await q.query('insert into public.welcome_dismissed (user_id) values ($1) on conflict do nothing', [userId]);
  return { show: false, text: null };
}

// Shared checks ------------------------------------------------------------------------

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  moderation_status: string;
  harm_category: string | null;
}

async function hurtingComment(q: Queryable, userId: string, commentId: string) {
  const { rows } = await q.query<CommentRow>('select id, post_id, user_id, body, moderation_status, harm_category from public.comments where id = $1', [commentId]);
  const c = rows[0];
  if (!c || c.moderation_status === 'removed') throw notFound('Comment');
  if (c.user_id === userId) throw badRequest('This is your own comment');
  // Never a way to reach someone across a block, in either direction.
  if (await isBlocked(q, userId, c.user_id)) throw forbidden('Not available for this person');
  return c;
}

// 2. Ask kindly ------------------------------------------------------------------------

const REASONS = { dismissive: 'felt dismissive', grief: 'was hard to read while grieving', unkind: 'felt unkind', other: 'was hurtful' } as const;
export const KindAsk = z.object({ reason: z.enum(['dismissive', 'grief', 'unkind', 'other']) });

/** Once per comment per sender. The author never learns who sent it. */
export async function askKindly(q: Queryable, userId: string, commentId: string, input: z.infer<typeof KindAsk>) {
  if (!(await settings(q)).ask_kindly_enabled) throw badRequest('Gentle notes are switched off');
  const c = await hurtingComment(q, userId, commentId);
  const { rowCount } = await q.query('insert into public.kind_asks (comment_id, sender_id, reason) values ($1, $2, $3) on conflict do nothing', [commentId, userId, input.reason]);
  if (rowCount)
    await notifications.notify(q, c.user_id, {
      kind: 'kind_ask',
      title: 'A gentle note about your comment',
      body: `Someone who read your comment felt it ${REASONS[input.reason]}. Would you consider editing or removing it? No one else was told.`,
      data: { postId: c.post_id, commentId },
      dedupeKey: `kind_ask:${commentId}:${userId}`,
    });
  return { sent: true };
}

// 3. Mend ------------------------------------------------------------------------------

type Status = 'invited' | 'review' | 'returned' | 'delivered' | 'accepted' | 'closed' | 'withdrawn';
interface MendRow {
  id: string;
  comment_id: string;
  hurt_id: string;
  author_id: string;
  status: Status;
  what_i_did: string | null;
  on_me: string | null;
  next_time: string | null;
  revisions: number;
  moderator_note: string | null;
  comment_body: string;
  post_id: string;
  author_name: string;
  updated_at: Date;
}

const mendSelect = `select m.*, c.body as comment_body, c.post_id, a.display_name as author_name
                      from public.mends m join public.comments c on c.id = m.comment_id join public.profiles a on a.id = m.author_id`;

async function requireMend(q: Queryable) {
  if (!(await settings(q)).mend_enabled) throw badRequest('Mend is switched off');
}

async function load(q: Queryable, mendId: string) {
  const { rows } = await q.query<MendRow>(`${mendSelect} where m.id = $1`, [mendId]);
  return rows[0] ?? null;
}

/** What each side may see: the author never learns who invited it; the hurt person sees the sorry only once a moderator delivered it. */
function present(m: MendRow, viewerId: string, staff: boolean) {
  const role = m.author_id === viewerId ? 'author' : m.hurt_id === viewerId ? 'hurt' : 'moderator';
  const showSorry = role !== 'hurt' || m.status === 'delivered' || m.status === 'accepted';
  return {
    id: m.id,
    role,
    status: m.status,
    comment: { postId: m.post_id, body: m.comment_body },
    author: role === 'author' ? null : { displayName: m.author_name },
    sorry: showSorry && m.what_i_did ? { whatIDid: m.what_i_did, onMe: m.on_me, nextTime: m.next_time } : null,
    canRevise: role === 'author' && (m.status === 'invited' || m.status === 'returned'),
    moderatorNote: role === 'author' && m.status === 'returned' ? m.moderator_note : null,
    ...(staff && role === 'moderator' ? { revisions: m.revisions } : {}),
  };
}

export async function invite(q: Queryable, userId: string, commentId: string) {
  await requireMend(q);
  const c = await hurtingComment(q, userId, commentId);
  // A comment held for harm (a threat, abuse) goes to moderators, never to an apology.
  if (c.harm_category || c.moderation_status !== 'visible') throw badRequest('Please report this comment instead');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.mends (comment_id, hurt_id, author_id) values ($1, $2, $3) on conflict (comment_id, hurt_id) do nothing returning id`,
    [commentId, userId, c.user_id],
  );
  if (!rows[0]) throw badRequest('You already invited a sorry for this comment');
  await notifications.notify(q, c.user_id, {
    kind: 'mend_invite',
    title: 'Someone was hurt by a comment of yours',
    body: "If you'd like, you can write them a short sorry. A moderator reads it first. It's entirely up to you.",
    data: { mendId: rows[0].id },
  });
  return mend(q, userId, rows[0].id);
}

export async function mend(q: Queryable, userId: string, mendId: string) {
  await requireMend(q);
  const m = await load(q, mendId);
  const staff = await hasRole(q, userId, 'moderator', 'admin');
  if (!m || (m.author_id !== userId && m.hurt_id !== userId && !staff)) throw notFound('Mend');
  return present(m, userId, staff);
}

export const Sorry = z.object({
  whatIDid: z.string().trim().min(1).max(600),
  onMe: z.string().trim().min(1).max(600),
  nextTime: z.string().trim().min(1).max(600),
});

/** The author writes (or, once, revises) the sorry. It waits for a moderator. */
export async function writeSorry(q: Queryable, userId: string, mendId: string, input: z.infer<typeof Sorry>) {
  await requireMend(q);
  const { rowCount } = await q.query(
    `update public.mends set what_i_did = $3, on_me = $4, next_time = $5, status = 'review',
            revisions = case when status = 'returned' then revisions + 1 else revisions end, moderator_note = null, updated_at = now()
      where id = $1 and author_id = $2 and status in ('invited', 'returned')`,
    [mendId, userId, input.whatIDid, input.onMe, input.nextTime],
  );
  if (!rowCount) throw badRequest('This can no longer be written');
  return mend(q, userId, mendId);
}

export async function reviewQueue(q: Queryable) {
  const { rows } = await q.query<MendRow>(`${mendSelect} where m.status = 'review' order by m.updated_at`);
  return rows.map((m) => present(m, '', true));
}

export const Review = z.object({ approve: z.boolean(), note: z.string().trim().max(600).optional() });

/**
 * A moderator delivers the sorry, or returns it once with a note (a second return
 * closes it). Moderators look for blame-shifting ("if you were offended", "but you…").
 */
export async function review(q: Queryable, moderatorId: string, mendId: string, input: z.infer<typeof Review>) {
  const m = await load(q, mendId);
  if (!m || m.status !== 'review') throw notFound('Mend');
  const status: Status = input.approve ? 'delivered' : m.revisions === 0 ? 'returned' : 'closed';
  await q.query(`update public.mends set status = $2, moderator_note = $3, reviewed_by = $4, updated_at = now() where id = $1`, [
    mendId,
    status,
    input.approve ? null : (input.note ?? null),
    moderatorId,
  ]);
  if (status === 'delivered')
    await notifications.notify(q, m.hurt_id, {
      kind: 'mend_delivered',
      title: 'Someone wrote you a sorry',
      body: `${m.author_name} wrote you a sorry about their comment. You can read it, and accept it or simply close it.`,
      data: { mendId },
    });
  else if (status === 'returned')
    await notifications.notify(q, m.author_id, {
      kind: 'mend_returned',
      title: 'A moderator suggests a change to your sorry',
      body: input.note ? `"${input.note.slice(0, 160)}" You can revise it once.` : 'You can revise it once.',
      data: { mendId },
    });
  else await notifications.notify(q, m.author_id, { kind: 'mend_closed', title: 'Your sorry was closed', body: 'Thank you for being willing.', data: { mendId } });
  return { status };
}

/** The hurt person accepts the sorry. The author hears it was received; nothing else changes. */
export async function accept(q: Queryable, userId: string, mendId: string) {
  await requireMend(q);
  const m = await load(q, mendId);
  if (!m || m.hurt_id !== userId || m.status !== 'delivered') throw notFound('Mend');
  await q.query(`update public.mends set status = 'accepted', updated_at = now() where id = $1`, [mendId]);
  const who = (await getProfile(q, userId))?.display_name || 'They';
  await notifications.notify(q, m.author_id, {
    kind: 'mend_accepted',
    title: 'Your sorry was received',
    body: `${who} read your sorry and accepted it. Thank you for making it right.`,
    data: { mendId },
  });
  return mend(q, userId, mendId);
}

/** The hurt person closes it at any point, before or after delivery. The author is only told it was closed. */
export async function close(q: Queryable, userId: string, mendId: string) {
  await requireMend(q);
  const m = await load(q, mendId);
  if (!m || m.hurt_id !== userId || ['accepted', 'closed', 'withdrawn'].includes(m.status)) throw notFound('Mend');
  const status: Status = m.status === 'delivered' ? 'closed' : 'withdrawn';
  await q.query(`update public.mends set status = $2, updated_at = now() where id = $1`, [mendId, status]);
  await notifications.notify(q, m.author_id, { kind: 'mend_closed', title: 'This was closed', body: 'Thank you for being willing.', data: { mendId } });
  return mend(q, userId, mendId);
}
