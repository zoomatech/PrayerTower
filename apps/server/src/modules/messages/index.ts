// Messages module: prayer-to-prayee messages. The person who posted a request
// and someone who prayed for it, committed to it or commented on it can talk
// about that request. Each message is scanned and can be reported like a
// comment; crisis words bring up the same support. Either person can block
// the other, and admins can turn messages off.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { presentIdentity } from '../accounts/index.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as safety from '../safety/index.js';

export const StartConversation = z.object({ withUserId: z.uuid().optional() });
export const NewMessage = z.object({ body: z.string().trim().min(1).max(2000) });

/** How someone is linked to a request: null when they are not, else whether every link is anonymous. */
async function link(q: Queryable, userId: string, postId: string): Promise<{ anonymous: boolean } | null> {
  const { rows } = await q.query<{ any: boolean; named: boolean }>(
    `select count(*) > 0 as any, coalesce(bool_or(not anon), false) as named from (
       select is_anonymous as anon from public.prayer_events where user_id = $1 and post_id = $2
       union all select is_anonymous from public.commitments where user_id = $1 and post_id = $2
       union all select is_anonymous from public.comments where user_id = $1 and post_id = $2 and moderation_status = 'visible'
     ) l`,
    [userId, postId],
  );
  return rows[0]!.any ? { anonymous: !rows[0]!.named } : null;
}

async function requireOpen(q: Queryable, a: string, b: string) {
  if (!(await safety.settings(q)).messages_enabled) throw forbidden('Messages are turned off right now.');
  const { rowCount } = await q.query(
    'select 1 from public.user_blocks where (user_id = $1 and blocked_id = $2) or (user_id = $2 and blocked_id = $1)',
    [a, b],
  );
  if (rowCount) throw forbidden("You can't message this person.");
}

/** Open (or reopen) the conversation about a request. A pray-er talks to the poster; the poster names who they want to talk to. */
export async function start(q: Queryable, userId: string, postId: string, input: z.infer<typeof StartConversation>) {
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  const isPoster = post.user_id === userId;
  const otherId = isPoster ? input.withUserId : post.user_id;
  if (!otherId) throw badRequest('Choose who to message');
  if (otherId === userId) throw badRequest('You cannot message yourself');
  const prayer = await link(q, isPoster ? otherId : userId, postId);
  if (!prayer) throw forbidden(isPoster ? 'You can message people who prayed for this request.' : 'Pray for this request first, then you can message the person who asked.');
  // A poster can't message someone whose prayers were anonymous: they don't know who it is.
  if (isPoster && prayer.anonymous) throw forbidden('This person prayed anonymously.');
  await requireOpen(q, userId, otherId);
  const flags = new Map([
    [post.user_id, post.is_anonymous],
    [isPoster ? otherId : userId, prayer.anonymous],
  ]);
  const [low, high] = [userId, otherId].sort();
  const { rows } = await q.query<{ id: string }>(
    `insert into public.conversations (post_id, community_id, user_low, user_high, low_anonymous, high_anonymous)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (post_id, user_low, user_high) do update set post_id = excluded.post_id
     returning id`,
    [postId, post.community_id, low, high, flags.get(low!), flags.get(high!)],
  );
  return { id: rows[0]!.id };
}

interface ConversationRow {
  id: string;
  post_id: string;
  post_body: string;
  user_low: string;
  user_high: string;
  low_anonymous: boolean;
  high_anonymous: boolean;
  low_read_at: Date | null;
  high_read_at: Date | null;
  last_message_at: Date | null;
  low_name: string;
  low_handle: string | null;
  high_name: string;
  high_handle: string | null;
  last_body: string | null;
}

const conversationSelect = `
  select c.*, left(po.body, 140) as post_body,
         pl.display_name as low_name, pl.handle as low_handle, ph.display_name as high_name, ph.handle as high_handle,
         (select body from public.messages m where m.conversation_id = c.id and m.moderation_status = 'visible' order by m.id desc limit 1) as last_body
    from public.conversations c
    join public.posts po on po.id = c.post_id
    join public.profiles pl on pl.id = c.user_low
    join public.profiles ph on ph.id = c.user_high`;

function present(c: ConversationRow, viewerId: string) {
  const mine = c.user_low === viewerId ? 'low' : 'high';
  const other =
    mine === 'low'
      ? presentIdentity({ id: c.user_high, display_name: c.high_name, handle: c.high_handle }, c.high_anonymous, viewerId)
      : presentIdentity({ id: c.user_low, display_name: c.low_name, handle: c.low_handle }, c.low_anonymous, viewerId);
  const readAt = mine === 'low' ? c.low_read_at : c.high_read_at;
  return {
    id: c.id,
    postId: c.post_id,
    postPreview: c.post_body,
    with: other,
    lastMessage: c.last_body,
    lastMessageAt: c.last_message_at,
    unread: !!c.last_message_at && (!readAt || readAt < c.last_message_at),
  };
}

async function getConversation(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<ConversationRow>(`${conversationSelect} where c.id = $1 and $2 in (c.user_low, c.user_high)`, [id, userId]);
  if (!rows[0]) throw notFound('Conversation');
  return rows[0];
}

export async function list(q: Queryable, userId: string) {
  const { rows } = await q.query<ConversationRow>(
    `${conversationSelect} where $1 in (c.user_low, c.user_high) and c.last_message_at is not null
      order by c.last_message_at desc limit 100`,
    [userId],
  );
  return rows.map((c) => present(c, userId));
}

export async function unreadCount(q: Queryable, userId: string) {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.conversations
      where (user_low = $1 and last_message_at > coalesce(low_read_at, '-infinity'))
         or (user_high = $1 and last_message_at > coalesce(high_read_at, '-infinity'))`,
    [userId],
  );
  return rows[0]!.n;
}

export async function messages(q: Queryable, userId: string, id: string) {
  const c = await getConversation(q, userId, id);
  const { rows } = await q.query<{ id: string; user_id: string; body: string; crisis: boolean; created_at: Date }>(
    `select id, user_id, body, crisis, created_at from public.messages
      where conversation_id = $1 and moderation_status = 'visible' order by id`,
    [id],
  );
  const { rowCount } = await q.query('select 1 from public.user_blocks where user_id = $1 and blocked_id = $2', [
    userId,
    c.user_low === userId ? c.user_high : c.user_low,
  ]);
  return {
    conversation: { ...present(c, userId), blocked: !!rowCount },
    messages: rows.map((m) => ({ id: m.id, mine: m.user_id === userId, body: m.body, crisis: m.crisis, createdAt: m.created_at })),
  };
}

export async function send(q: Queryable, userId: string, id: string, input: z.infer<typeof NewMessage>) {
  const c = await getConversation(q, userId, id);
  const otherId = c.user_low === userId ? c.user_high : c.user_low;
  await requireOpen(q, userId, otherId);
  const blocked = await safety.newMemberBlock(q, userId, 'send messages');
  if (blocked) throw forbidden(blocked);
  if (!(await posts.getVisible(q, c.post_id))) throw forbidden('This request is no longer up.');
  const { rows } = await q.query<{ id: string; created_at: Date }>(
    `insert into public.messages (conversation_id, user_id, community_id, body)
     select id, $2, community_id, $3 from public.conversations where id = $1 returning id, created_at`,
    [id, userId, input.body],
  );
  const msg = rows[0]!;
  const side = c.user_low === userId ? 'low' : 'high';
  await q.query(`update public.conversations set last_message_at = $2, ${side}_read_at = $2 where id = $1`, [id, msg.created_at]);
  await moderation.queueScan(q, 'message', msg.id);
  const crisis = safety.mentionsCrisis(input.body);
  if (crisis) await moderation.flagCrisis(q, 'message', msg.id);
  const me = present(c, otherId).with;
  await notifications.notify(q, otherId, {
    kind: 'message',
    title: `${me.displayName} sent you a message`,
    body: input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body,
    data: { conversationId: id, postId: c.post_id },
  });
  return { id: msg.id, crisis };
}

export async function markRead(q: Queryable, userId: string, id: string) {
  const c = await getConversation(q, userId, id);
  const side = c.user_low === userId ? 'low' : 'high';
  await q.query(`update public.conversations set ${side}_read_at = now() where id = $1`, [id]);
}

/** Block (or unblock) the other person in a conversation, which may be someone anonymous. Blocks stop messages both ways. */
export async function setBlocked(q: Queryable, userId: string, id: string, blocked: boolean) {
  const c = await getConversation(q, userId, id);
  const otherId = c.user_low === userId ? c.user_high : c.user_low;
  if (blocked) {
    await q.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2) on conflict do nothing', [userId, otherId]);
  } else {
    await q.query('delete from public.user_blocks where user_id = $1 and blocked_id = $2', [userId, otherId]);
  }
}
