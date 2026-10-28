// Groups module: prayer groups with a group chat and a shared prayer list.
// Public groups can be found and joined by anyone; private groups only with
// their invite code. Group messages share the messages table with private
// messages, so they are scanned, reportable and crisis-checked the same way.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, forbidden, notFound } from '../../errors.js';
import { presentIdentity, primaryCommunityId } from '../accounts/index.js';
import * as moderation from '../moderation/index.js';
import * as notifications from '../notifications/index.js';
import * as posts from '../posts/index.js';
import * as safety from '../safety/index.js';

export const NewGroup = z.object({
  name: z.string().trim().min(1).max(60),
  purpose: z.string().trim().max(500).default(''),
  isPrivate: z.boolean().default(false),
});
export const NewGroupMessage = z.object({ body: z.string().trim().min(1).max(2000) });

interface GroupRow {
  id: string;
  name: string;
  purpose: string;
  is_private: boolean;
  invite_code: string;
  created_by: string;
  last_message_at: Date | null;
  members: number;
  role: 'leader' | 'member' | null;
  read_at: Date | null;
}

const groupSelect = `
  select g.*, (select count(*)::int from public.prayer_group_members m where m.group_id = g.id) as members,
         me.role, me.read_at
    from public.prayer_groups g
    left join public.prayer_group_members me on me.group_id = g.id and me.user_id = $1`;

function present(g: GroupRow) {
  return {
    id: g.id,
    name: g.name,
    purpose: g.purpose,
    isPrivate: g.is_private,
    members: g.members,
    role: g.role,
    // Only members see the invite code, so they can bring others in.
    inviteCode: g.role ? g.invite_code : null,
    unread: !!g.role && !!g.last_message_at && (!g.read_at || g.read_at < g.last_message_at),
  };
}

async function requireMember(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<GroupRow>(`${groupSelect} where g.id = $2 and g.archived_at is null`, [userId, id]);
  const g = rows[0];
  if (!g || (!g.role && g.is_private)) throw notFound('Group');
  if (!g.role) throw forbidden('Join this group first.');
  return g;
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewGroup>) {
  const blocked = await safety.newMemberBlock(q, userId, 'start a group');
  if (blocked) throw forbidden(blocked);
  const { groups_per_member: cap } = await safety.settings(q);
  const { rows: led } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.prayer_group_members m join public.prayer_groups g on g.id = m.group_id
      where m.user_id = $1 and m.role = 'leader' and g.archived_at is null`,
    [userId],
  );
  if (led[0]!.n >= cap) throw forbidden(`You can lead up to ${cap} groups at once.`);
  const { rows } = await q.query<{ id: string }>(
    `insert into public.prayer_groups (community_id, name, purpose, is_private, created_by) values ($1, $2, $3, $4, $5) returning id`,
    [await primaryCommunityId(q, userId), input.name, input.purpose, input.isPrivate, userId],
  );
  const id = rows[0]!.id;
  await q.query(`insert into public.prayer_group_members (group_id, user_id, role, read_at) values ($1, $2, 'leader', now())`, [id, userId]);
  return { id };
}

/** The member's groups, newest activity first, plus public groups they could join. */
export async function list(q: Queryable, userId: string) {
  const { rows: mine } = await q.query<GroupRow>(
    `${groupSelect} where me.user_id is not null and g.archived_at is null order by coalesce(g.last_message_at, g.created_at) desc`,
    [userId],
  );
  const { rows: open } = await q.query<GroupRow>(
    `${groupSelect} where me.user_id is null and not g.is_private and g.archived_at is null order by g.created_at desc limit 50`,
    [userId],
  );
  return { mine: mine.map(present), discover: open.map(present) };
}

export async function join(q: Queryable, userId: string, id: string, inviteCode?: string) {
  const { rows } = await q.query<{ id: string; is_private: boolean; invite_code: string }>(
    'select id, is_private, invite_code from public.prayer_groups where id = $1 and archived_at is null',
    [id],
  );
  const g = rows[0];
  if (!g || (g.is_private && g.invite_code !== inviteCode)) throw notFound('Group');
  await q.query('insert into public.prayer_group_members (group_id, user_id, read_at) values ($1, $2, now()) on conflict do nothing', [id, userId]);
}

/** Join a private group by its invite code alone. */
export async function joinByCode(q: Queryable, userId: string, code: string) {
  const { rows } = await q.query<{ id: string }>('select id from public.prayer_groups where invite_code = $1 and archived_at is null', [code]);
  if (!rows[0]) throw notFound('Group');
  await join(q, userId, rows[0].id, code);
  return { id: rows[0].id };
}

export async function leave(q: Queryable, userId: string, id: string) {
  const g = await requireMember(q, userId, id);
  await q.query('delete from public.prayer_group_members where group_id = $1 and user_id = $2', [id, userId]);
  // A group whose last leader leaves passes to its longest-standing member, or closes when empty.
  if (g.role === 'leader') {
    await q.query(
      `update public.prayer_group_members set role = 'leader'
        where group_id = $1 and not exists (select 1 from public.prayer_group_members where group_id = $1 and role = 'leader')
          and user_id = (select user_id from public.prayer_group_members where group_id = $1 order by joined_at limit 1)`,
      [id],
    );
    await q.query(
      'update public.prayer_groups set archived_at = now() where id = $1 and not exists (select 1 from public.prayer_group_members where group_id = $1)',
      [id],
    );
  }
}

/** The group page: details, members, the shared prayer list and the chat. */
export async function get(q: Queryable, userId: string, id: string) {
  const g = await requireMember(q, userId, id);
  const { rows: members } = await q.query<{ id: string; display_name: string; handle: string | null; role: string }>(
    `select p.id, p.display_name, p.handle, m.role from public.prayer_group_members m join public.profiles p on p.id = m.user_id
      where m.group_id = $1 order by m.role, m.joined_at`,
    [id],
  );
  const { rows: list } = await q.query<{ post_id: string }>(
    `select gp.post_id from public.prayer_group_posts gp join public.posts p on p.id = gp.post_id
      where gp.group_id = $1 and p.moderation_status = 'visible' order by gp.created_at desc limit 50`,
    [id],
  );
  const { rows: chat } = await q.query<{ id: string; user_id: string; display_name: string; handle: string | null; body: string; created_at: Date }>(
    `select m.id, m.user_id, p.display_name, p.handle, m.body, m.created_at
       from public.messages m join public.profiles p on p.id = m.user_id
      where m.group_id = $1 and m.moderation_status = 'visible' order by m.id desc limit 100`,
    [id],
  );
  await q.query('update public.prayer_group_members set read_at = now() where group_id = $1 and user_id = $2', [id, userId]);
  return {
    group: present(g),
    members: members.map((m) => ({ id: m.id, displayName: m.display_name, handle: m.handle, role: m.role })),
    prayerList: await posts.cards(q, list.map((r) => r.post_id), userId),
    messages: chat.reverse().map((m) => ({
      id: m.id,
      mine: m.user_id === userId,
      author: presentIdentity({ id: m.user_id, display_name: m.display_name, handle: m.handle }, false, userId),
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

export async function addToList(q: Queryable, userId: string, id: string, postId: string) {
  await requireMember(q, userId, id);
  const post = await posts.getVisible(q, postId);
  if (!post) throw notFound('Post');
  // Sensitive requests stay where the poster put them.
  if (post.is_sensitive && post.user_id !== userId) throw forbidden('Only the person who asked can share a sensitive request.');
  const { rowCount } = await q.query(
    'insert into public.prayer_group_posts (group_id, post_id, added_by) values ($1, $2, $3) on conflict do nothing',
    [id, postId, userId],
  );
  if (!rowCount) throw conflict('Already on the prayer list');
}

export async function removeFromList(q: Queryable, userId: string, id: string, postId: string) {
  const g = await requireMember(q, userId, id);
  const { rowCount } = await q.query(
    `delete from public.prayer_group_posts where group_id = $1 and post_id = $2 and ($3 or added_by = $4)`,
    [id, postId, g.role === 'leader', userId],
  );
  if (!rowCount) throw forbidden('Only the leader or whoever added it can take it off.');
}

export async function send(q: Queryable, userId: string, id: string, input: z.infer<typeof NewGroupMessage>) {
  const g = await requireMember(q, userId, id);
  if (!(await safety.settings(q)).messages_enabled) throw forbidden('Messages are turned off right now.');
  const blocked = await safety.newMemberBlock(q, userId, 'send messages');
  if (blocked) throw forbidden(blocked);
  const { rows } = await q.query<{ id: string; created_at: Date }>(
    `insert into public.messages (group_id, user_id, community_id, body)
     select id, $2, community_id, $3 from public.prayer_groups where id = $1 returning id, created_at`,
    [id, userId, input.body],
  );
  const msg = rows[0]!;
  await q.query('update public.prayer_groups set last_message_at = $2 where id = $1', [id, msg.created_at]);
  await q.query('update public.prayer_group_members set read_at = $3 where group_id = $1 and user_id = $2', [id, userId, msg.created_at]);
  await moderation.queueScan(q, 'message', msg.id);
  const crisis = safety.mentionsCrisis(input.body);
  if (crisis) await moderation.flagCrisis(q, 'message', msg.id);
  // One notice per member per hour of activity, so a busy chat doesn't flood anyone.
  const { rows: others } = await q.query<{ user_id: string }>(
    'select user_id from public.prayer_group_members where group_id = $1 and user_id <> $2',
    [id, userId],
  );
  const hour = msg.created_at.toISOString().slice(0, 13);
  for (const o of others) {
    await notifications.notify(q, o.user_id, {
      kind: 'group_message',
      title: `New messages in ${g.name}`,
      body: input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body,
      data: { groupId: id },
      dedupeKey: `group:${id}:${hour}`,
    });
  }
  return { id: msg.id, crisis };
}
