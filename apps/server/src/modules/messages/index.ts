// Messages module: Features Set 2 (notebook Page 9). One conversation model
// covers pray-er-to-prayee threads, general direct messages and prayer &
// topical group chats. Safety first: message requests (the starter can send a
// limited number until the other person replies or accepts), blocking, new-
// member limits, crisis support, and the same report / AI-flag queue as posts.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, forbidden, notFound } from '../../errors.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as safety from '../safety/index.js';

export interface MessagingSettings {
  prayer_messages_enabled: boolean;
  prayer_messages_any_prayer: boolean;
  direct_messages_enabled: boolean;
  direct_requires_mutual_follow: boolean;
  groups_enabled: boolean;
  request_message_limit: number;
  new_members_can_start: boolean;
  new_member_messages_per_day: number;
  group_max_members: number;
}

const COLUMNS = Object.keys({
  prayer_messages_enabled: 0,
  prayer_messages_any_prayer: 0,
  direct_messages_enabled: 0,
  direct_requires_mutual_follow: 0,
  groups_enabled: 0,
  request_message_limit: 0,
  new_members_can_start: 0,
  new_member_messages_per_day: 0,
  group_max_members: 0,
} satisfies Record<keyof MessagingSettings, 0>) as (keyof MessagingSettings)[];

export async function settings(q: Queryable): Promise<MessagingSettings> {
  const { rows } = await q.query<MessagingSettings>(`select ${COLUMNS.join(', ')} from public.messaging_settings`);
  return rows[0]!;
}

export async function updateSettings(q: Queryable, patch: Partial<MessagingSettings>): Promise<MessagingSettings> {
  const sets = COLUMNS.map((c, i) => `${c} = coalesce($${i + 1}, ${c})`).join(', ');
  const { rows } = await q.query<MessagingSettings>(`update public.messaging_settings set ${sets} returning ${COLUMNS.join(', ')}`, [
    ...COLUMNS.map((c) => patch[c] ?? null),
  ]);
  return rows[0]!;
}

// Blocking -------------------------------------------------------------------------

/** True when either member has blocked the other. */
export async function isBlocked(q: Queryable, a: string, b: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `select 1 from public.user_blocks where (user_id = $1 and blocked_id = $2) or (user_id = $2 and blocked_id = $1)`,
    [a, b],
  );
  return !!rowCount;
}

export async function block(q: Queryable, userId: string, blockedId: string) {
  if (userId === blockedId) throw badRequest("You can't block yourself");
  const { rowCount } = await q.query('select 1 from public.profiles where id = $1', [blockedId]);
  if (!rowCount) throw notFound('Member');
  await q.query('insert into public.user_blocks (user_id, blocked_id) values ($1, $2) on conflict do nothing', [userId, blockedId]);
  // Blocking also ends following both ways.
  await q.query('delete from public.follows where (user_id = $1 and followee_id = $2) or (user_id = $2 and followee_id = $1)', [
    userId,
    blockedId,
  ]);
}

export async function unblock(q: Queryable, userId: string, blockedId: string) {
  await q.query('delete from public.user_blocks where user_id = $1 and blocked_id = $2', [userId, blockedId]);
}

export async function blocks(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; display_name: string; blocked_at: Date }>(
    `select p.id, p.display_name, b.created_at as blocked_at
       from public.user_blocks b join public.profiles p on p.id = b.blocked_id
      where b.user_id = $1 order by b.created_at desc`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, displayName: r.display_name || 'Member', blockedAt: r.blocked_at }));
}

// Starting conversations -------------------------------------------------------------

const Body = z.string().trim().min(1).max(2000);

export const NewPrayerThread = z.object({ body: Body, isAnonymous: z.boolean().default(false) });
export const NewDirect = z.object({ userId: z.uuid(), body: Body });
export const NewGroup = z.object({
  title: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(280).optional(),
  isPublic: z.boolean().default(false),
  memberIds: z.array(z.uuid()).max(50).default([]),
});
export const NewMessage = z.object({ body: Body });

async function checkCanStart(q: Queryable, userId: string) {
  const s = await settings(q);
  if (s.new_members_can_start) return;
  const reason = await safety.newMemberBlock(q, userId, 'start conversations');
  if (reason) throw forbidden(reason);
}

async function addMember(
  q: Queryable,
  conversationId: string,
  userId: string,
  opts: { status?: 'invited' | 'active'; owner?: boolean; anonymous?: boolean; invitedBy?: string | null } = {},
) {
  await q.query(
    `insert into public.conversation_members (conversation_id, user_id, status, is_owner, is_anonymous, invited_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (conversation_id, user_id) do update
       set status = case when public.conversation_members.status in ('declined', 'left') then excluded.status
                         else public.conversation_members.status end`,
    [conversationId, userId, opts.status ?? 'active', opts.owner ?? false, opts.anonymous ?? false, opts.invitedBy ?? null],
  );
}

/**
 * A pray-er writes privately to the person they prayed for. Only someone who
 * prayed for (or, by setting, committed to) the request can start one, once
 * per request. The requester sees it as a message request until they reply.
 */
export async function startPrayerThread(q: Queryable, userId: string, postId: string, input: z.infer<typeof NewPrayerThread>) {
  const s = await settings(q);
  if (!s.prayer_messages_enabled) throw forbidden('Messages to requesters are turned off for now');
  const { rows: posts } = await q.query<{ user_id: string; is_anonymous: boolean; community_id: string }>(
    `select user_id, is_anonymous, community_id from public.posts where id = $1 and moderation_status = 'visible'`,
    [postId],
  );
  const post = posts[0];
  if (!post) throw notFound('Post');
  if (post.user_id === userId) throw badRequest('This is your own request');
  const { rows: eligible } = await q.query<{ prayed: boolean; committed: boolean }>(
    `select exists (select 1 from public.prayer_events where post_id = $1 and user_id = $2) as prayed,
            exists (select 1 from public.commitments where post_id = $1 and user_id = $2) as committed`,
    [postId, userId],
  );
  const { prayed, committed } = eligible[0]!;
  if (!(committed || (s.prayer_messages_any_prayer && prayed))) {
    throw forbidden(s.prayer_messages_any_prayer ? 'Pray for this request first, then you can write to them' : 'Commit to pray first, then you can write to them');
  }
  if (await isBlocked(q, userId, post.user_id)) throw forbidden("You can't message this member");

  const { rows: existing } = await q.query<{ id: string }>(
    `select id from public.conversations where kind = 'prayer' and post_id = $1 and created_by = $2`,
    [postId, userId],
  );
  let id = existing[0]?.id;
  if (!id) {
    await checkCanStart(q, userId);
    const { rows } = await q.query<{ id: string }>(
      `insert into public.conversations (kind, community_id, post_id, created_by) values ('prayer', $1, $2, $3) returning id`,
      [post.community_id, postId, userId],
    );
    id = rows[0]!.id;
    await addMember(q, id, userId, { owner: true, anonymous: input.isAnonymous });
    await addMember(q, id, post.user_id, { status: 'invited', anonymous: post.is_anonymous, invitedBy: userId });
  }
  const message = await send(q, userId, id, { body: input.body });
  return { conversationId: id, message };
}

async function mutualFollow(q: Queryable, a: string, b: string): Promise<boolean> {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.follows where (user_id = $1 and followee_id = $2) or (user_id = $2 and followee_id = $1)`,
    [a, b],
  );
  return rows[0]!.n === 2;
}

/** Two members who have already talked in an accepted pray-er thread. */
async function prayerConnected(q: Queryable, a: string, b: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `select 1 from public.conversations c
       join public.conversation_members ma on ma.conversation_id = c.id and ma.user_id = $1 and ma.status = 'active'
       join public.conversation_members mb on mb.conversation_id = c.id and mb.user_id = $2 and mb.status = 'active'
      where c.kind = 'prayer' and not ma.is_anonymous and not mb.is_anonymous`,
    [a, b],
  );
  return !!rowCount;
}

/** General direct messages: by default only between members who follow each other (or met in a pray-er thread). */
export async function startDirect(q: Queryable, userId: string, input: z.infer<typeof NewDirect>) {
  const s = await settings(q);
  if (!s.direct_messages_enabled) throw forbidden('Direct messages are turned off for now');
  const otherId = input.userId;
  if (otherId === userId) throw badRequest("You can't message yourself");
  const { rowCount } = await q.query('select 1 from public.profiles where id = $1', [otherId]);
  if (!rowCount) throw notFound('Member');
  if (await isBlocked(q, userId, otherId)) throw forbidden("You can't message this member");
  const connected = (await mutualFollow(q, userId, otherId)) || (await prayerConnected(q, userId, otherId));
  if (s.direct_requires_mutual_follow && !connected) throw forbidden('You can message people who follow you back');

  const { rows: existing } = await q.query<{ id: string }>(
    `select c.id from public.conversations c
       join public.conversation_members a on a.conversation_id = c.id and a.user_id = $1
       join public.conversation_members b on b.conversation_id = c.id and b.user_id = $2
      where c.kind = 'direct' limit 1`,
    [userId, otherId],
  );
  let id = existing[0]?.id;
  if (id) {
    // Coming back to an old conversation re-opens it for the starter.
    await q.query(`update public.conversation_members set status = 'active' where conversation_id = $1 and user_id = $2`, [id, userId]);
  } else {
    await checkCanStart(q, userId);
    const { rows } = await q.query<{ id: string }>(
      `insert into public.conversations (kind, created_by) values ('direct', $1) returning id`,
      [userId],
    );
    id = rows[0]!.id;
    await addMember(q, id, userId, { owner: true });
    await addMember(q, id, otherId, { status: connected ? 'active' : 'invited', invitedBy: userId });
  }
  const message = await send(q, userId, id, { body: input.body });
  return { conversationId: id, message };
}

/** Prayer & topical group chats. Public groups can be found and joined; private ones are invite-only. */
export async function createGroup(q: Queryable, userId: string, input: z.infer<typeof NewGroup>) {
  const s = await settings(q);
  if (!s.groups_enabled) throw forbidden('Group chats are turned off for now');
  await checkCanStart(q, userId);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.conversations (kind, created_by, title, topic, is_public) values ('group', $1, $2, $3, $4) returning id`,
    [userId, input.title, input.topic || null, input.isPublic],
  );
  const id = rows[0]!.id;
  await addMember(q, id, userId, { owner: true });
  const invited = await invite(q, userId, id, input.memberIds);
  return { conversationId: id, invited };
}

async function getConversation(q: Queryable, id: string) {
  const { rows } = await q.query<{
    id: string;
    kind: 'prayer' | 'direct' | 'group' | 'care';
    post_id: string | null;
    title: string | null;
    topic: string | null;
    is_public: boolean;
    closed_at: Date | null;
    created_by: string;
  }>('select id, kind, post_id, title, topic, is_public, closed_at, created_by from public.conversations where id = $1', [id]);
  return rows[0] ?? null;
}

async function membership(q: Queryable, conversationId: string, userId: string) {
  const { rows } = await q.query<{ status: string; is_owner: boolean; last_read_at: Date | null }>(
    'select status, is_owner, last_read_at from public.conversation_members where conversation_id = $1 and user_id = $2',
    [conversationId, userId],
  );
  return rows[0] ?? null;
}

async function activeCount(q: Queryable, conversationId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.conversation_members where conversation_id = $1 and status in ('active', 'invited')`,
    [conversationId],
  );
  return rows[0]!.n;
}

/** Group members invite others (private groups: the owner only). Blocked pairs are skipped. */
export async function invite(q: Queryable, userId: string, conversationId: string, memberIds: string[]) {
  const c = await getConversation(q, conversationId);
  if (!c || c.kind !== 'group') throw notFound('Group');
  const me = await membership(q, conversationId, userId);
  if (me?.status !== 'active' || (!c.is_public && !me.is_owner)) throw forbidden('Only the group owner can invite people');
  const s = await settings(q);
  let invited = 0;
  for (const id of new Set(memberIds)) {
    if (id === userId || (await isBlocked(q, userId, id))) continue;
    if ((await activeCount(q, conversationId)) >= s.group_max_members) throw badRequest(`Groups can have ${s.group_max_members} members`);
    const current = await membership(q, conversationId, id);
    if (current && current.status !== 'left') continue; // already in, invited, or said no
    const { rowCount } = await q.query('select 1 from public.profiles where id = $1', [id]);
    if (!rowCount) continue;
    await addMember(q, conversationId, id, { status: 'invited', invitedBy: userId });
    await notifications.notify(q, id, {
      kind: 'group_invite',
      title: 'You were invited to a group',
      body: `Join "${c.title}" to pray and talk together.`,
      data: { conversationId },
      dedupeKey: `group_invite:${conversationId}`,
    });
    invited++;
  }
  return invited;
}

export async function joinGroup(q: Queryable, userId: string, conversationId: string) {
  const c = await getConversation(q, conversationId);
  if (!c || c.kind !== 'group' || c.closed_at) throw notFound('Group');
  const me = await membership(q, conversationId, userId);
  if (!c.is_public && me?.status !== 'invited') throw forbidden('This group is invite-only');
  if (me?.status === 'active') return;
  const s = await settings(q);
  if ((await activeCount(q, conversationId)) >= s.group_max_members && !me) throw badRequest('This group is full');
  await addMember(q, conversationId, userId);
  await q.query(`update public.conversation_members set status = 'active' where conversation_id = $1 and user_id = $2`, [
    conversationId,
    userId,
  ]);
}

/** Accept a message request or group invite. */
export async function accept(q: Queryable, userId: string, conversationId: string) {
  const { rowCount } = await q.query(
    `update public.conversation_members set status = 'active' where conversation_id = $1 and user_id = $2 and status = 'invited'`,
    [conversationId, userId],
  );
  if (!rowCount) throw notFound('Request');
}

/** Say no to a request (the starter can't send more), or leave a conversation. */
export async function decline(q: Queryable, userId: string, conversationId: string) {
  const { rowCount } = await q.query(
    `update public.conversation_members set status = case when status = 'invited' then 'declined'::public.conversation_member_status else 'left' end
      where conversation_id = $1 and user_id = $2 and status in ('invited', 'active')`,
    [conversationId, userId],
  );
  if (!rowCount) throw notFound('Conversation');
}

// Sending and reading -----------------------------------------------------------------

/** The display name a member shows in a conversation. */
const nameSql = (m: string, p: string) => `case when ${m}.is_anonymous then 'Anonymous' else coalesce(nullif(${p}.display_name, ''), 'Member') end`;

export async function send(q: Queryable, userId: string, conversationId: string, input: z.infer<typeof NewMessage>) {
  const c = await getConversation(q, conversationId);
  if (!c) throw notFound('Conversation');
  if (c.closed_at) throw forbidden('This conversation is closed');
  const me = await membership(q, conversationId, userId);
  if (!me || (me.status !== 'active' && me.status !== 'invited')) throw forbidden('You are not in this conversation');
  // Replying to a request accepts it.
  if (me.status === 'invited') await accept(q, userId, conversationId);

  const { rows: others } = await q.query<{ user_id: string; status: string }>(
    `select user_id, status from public.conversation_members where conversation_id = $1 and user_id <> $2`,
    [conversationId, userId],
  );
  if (c.kind !== 'group') {
    const other = others[0];
    if (!other) throw forbidden('No one else is in this conversation');
    if (await isBlocked(q, userId, other.user_id)) throw forbidden("You can't message this member");
    if (other.status === 'declined' || other.status === 'left') throw forbidden("They aren't accepting messages in this conversation");
    if (other.status === 'invited') {
      const s = await settings(q);
      const { rows } = await q.query<{ n: number }>(
        'select count(*)::int as n from public.messages where conversation_id = $1 and user_id = $2',
        [conversationId, userId],
      );
      if (rows[0]!.n >= s.request_message_limit) {
        throw new AppError(429, 'awaiting_reply', 'Your message is waiting for them. You can write again once they reply.');
      }
    }
  }
  await checkNewMemberMessage(q, userId, input.body);

  const { rows } = await q.query<{ id: string; created_at: Date }>(
    `insert into public.messages (conversation_id, user_id, community_id, body)
     select $1, $2, community_id, $3 from public.conversations where id = $1
     returning id, created_at`,
    [conversationId, userId, input.body],
  );
  const message = rows[0]!;
  await q.query('update public.conversations set last_message_at = $2 where id = $1', [conversationId, message.created_at]);
  await q.query('update public.conversation_members set last_read_at = $3 where conversation_id = $1 and user_id = $2', [
    conversationId,
    userId,
    message.created_at,
  ]);
  await moderation.queueScan(q, 'message', message.id);
  const crisis = safety.mentionsCrisis(input.body);
  if (crisis) await moderation.flagCrisis(q, 'message', message.id);

  // Pray-er threads and direct messages notify the other person (at most one notice per conversation an hour).
  // Group messages don't push; members see them in the Messages tab.
  if (c.kind !== 'group') {
    const other = others[0]!;
    const { rows: who } = await q.query<{ name: string }>(
      `select ${nameSql('m', 'p')} as name from public.conversation_members m join public.profiles p on p.id = m.user_id
        where m.conversation_id = $1 and m.user_id = $2`,
      [conversationId, userId],
    );
    const name = who[0]!.name;
    await notifications.notify(q, other.user_id, {
      kind: 'message',
      title: c.kind === 'prayer' ? `${name} prayed for you and sent a message` : `New message from ${name}`,
      body: input.body.length > 120 ? `${input.body.slice(0, 117)}…` : input.body,
      data: { conversationId },
      dedupeKey: `message:${conversationId}:${Math.floor(Date.now() / 3_600_000)}`,
    });
  }
  return { id: message.id, createdAt: message.created_at, crisis };
}

/** New members: no links (per safety settings) and a daily message cap. */
async function checkNewMemberMessage(q: Queryable, userId: string, body: string) {
  const s = await safety.settings(q);
  if (!s.new_member_limits_enabled || !(await safety.isNewMember(q, userId, s))) return;
  const lift = 'This limit lifts once you have been here a day and prayed for a few requests.';
  if (!s.new_member_links_allowed && safety.hasLink(body)) throw forbidden(`New members can't include links yet. ${lift}`);
  const m = await settings(q);
  const { rows } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.messages where user_id = $1 and created_at > now() - interval '1 day'`,
    [userId],
  );
  if (rows[0]!.n >= m.new_member_messages_per_day) {
    throw new AppError(429, 'new_member_limit', `New members can send ${m.new_member_messages_per_day} messages a day. ${lift}`);
  }
}

/** My conversations, newest first, with requests and invites marked. */
export async function list(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select c.id, c.kind, c.post_id, c.title, c.topic, c.is_public, c.last_message_at, c.created_at,
            me.status as my_status, me.is_owner,
            (select string_agg(${nameSql('m', 'p')}, ', ' order by m.joined_at)
               from public.conversation_members m join public.profiles p on p.id = m.user_id
              where m.conversation_id = c.id and m.user_id <> $1 and m.status in ('active', 'invited')) as others,
            (select count(*)::int from public.conversation_members m
              where m.conversation_id = c.id and m.status = 'active') as member_count,
            last.body as last_body,
            (select count(*)::int from public.messages x
              where x.conversation_id = c.id and x.user_id <> $1 and x.moderation_status = 'visible'
                and x.created_at > coalesce(me.last_read_at, '-infinity')
                and not exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = x.user_id)) as unread
       from public.conversation_members me
       join public.conversations c on c.id = me.conversation_id
       left join lateral (
         select x.body from public.messages x
          where x.conversation_id = c.id and x.moderation_status = 'visible'
            and not exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = x.user_id)
          order by x.id desc limit 1) last on true
      where me.user_id = $1 and me.status in ('active', 'invited')
        -- A request from someone I blocked disappears.
        and not (me.status = 'invited' and exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = c.created_by))
      order by coalesce(c.last_message_at, c.created_at) desc
      limit 200`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    postId: r.post_id,
    title: r.kind === 'group' ? r.title : r.others || 'Conversation',
    topic: r.topic,
    isPublic: r.is_public,
    isRequest: r.my_status === 'invited',
    isOwner: r.is_owner,
    memberCount: r.member_count,
    lastMessage: r.last_body,
    lastMessageAt: r.last_message_at,
    unread: r.unread,
  }));
}

/** One conversation with its newest messages (pass `before` to page back). Blocked members' messages are hidden. */
export async function read(q: Queryable, userId: string, conversationId: string, before?: string) {
  const c = await getConversation(q, conversationId);
  const me = c && (await membership(q, conversationId, userId));
  if (!c || !me || (me.status !== 'active' && me.status !== 'invited')) throw notFound('Conversation');
  const { rows: messages } = await q.query(
    `select x.id, x.user_id = $2 as mine, ${nameSql('m', 'p')} as author, x.body, x.crisis, x.created_at
       from public.messages x
       join public.conversation_members m on m.conversation_id = x.conversation_id and m.user_id = x.user_id
       join public.profiles p on p.id = x.user_id
      where x.conversation_id = $1 and x.moderation_status = 'visible'
        and ($3::uuid is null or x.id < $3)
        and not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = x.user_id)
      order by x.id desc limit 50`,
    [conversationId, userId, before ?? null],
  );
  const { rows: members } = await q.query(
    `select case when m.is_anonymous then null else m.user_id end as id, ${nameSql('m', 'p')} as name, m.status, m.is_owner
       from public.conversation_members m join public.profiles p on p.id = m.user_id
      where m.conversation_id = $1 and m.status in ('active', 'invited') and m.user_id <> $2
      order by m.joined_at`,
    [conversationId, userId],
  );
  let post: { id: string; excerpt: string } | null = null;
  if (c.post_id) {
    const { rows } = await q.query<{ body: string }>('select body from public.posts where id = $1', [c.post_id]);
    if (rows[0]) post = { id: c.post_id, excerpt: rows[0].body.length > 140 ? `${rows[0].body.slice(0, 137)}…` : rows[0].body };
  }
  const waiting = c.kind !== 'group' && members.length > 0 && members.every((m) => m.status === 'invited');
  return {
    conversation: {
      id: c.id,
      kind: c.kind,
      title: c.kind === 'group' ? c.title : members.map((m) => m.name).join(', ') || 'Conversation',
      topic: c.topic,
      isPublic: c.is_public,
      isRequest: me.status === 'invited',
      isOwner: me.is_owner,
      // The starter is waiting for the other person to reply.
      awaitingReply: waiting,
      post,
      members: members.map((m) => ({ id: m.id, name: m.name, invited: m.status === 'invited', isOwner: m.is_owner })),
    },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      mine: m.mine,
      author: m.author,
      body: m.body,
      crisis: m.crisis,
      createdAt: m.created_at,
    })),
  };
}

export async function markRead(q: Queryable, userId: string, conversationId: string) {
  await q.query(`update public.conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2`, [
    conversationId,
    userId,
  ]);
}

/** Public groups to discover, busiest first. */
export async function publicGroups(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select c.id, c.title, c.topic, c.last_message_at,
            (select count(*)::int from public.conversation_members m where m.conversation_id = c.id and m.status = 'active') as member_count,
            exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = $1 and m.status = 'active') as joined
       from public.conversations c
      where c.kind = 'group' and c.is_public and c.closed_at is null
        and c.community_id = any (select community_id from public.community_memberships where user_id = $1)
        and not exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = c.created_by)
      order by member_count desc, c.last_message_at desc nulls last
      limit 100`,
    [userId],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, topic: r.topic, memberCount: r.member_count, joined: r.joined, lastMessageAt: r.last_message_at }));
}

/** A reporter must be able to see the message they report. */
export async function canSee(q: Queryable, userId: string, messageId: string): Promise<boolean> {
  const { rowCount } = await q.query(
    `select 1 from public.messages x join public.conversation_members m on m.conversation_id = x.conversation_id
      where x.id = $1 and m.user_id = $2 and m.status in ('active', 'invited', 'left', 'declined')`,
    [messageId, userId],
  );
  return !!rowCount;
}
