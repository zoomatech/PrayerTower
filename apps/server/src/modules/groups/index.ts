// Groups (Steve, 2026-10-31): open topic groups like Facebook groups, starting with "Cancer
// survivors". Separate from prayer circles (invite-only, up to 12) and study rooms, which stay as
// they are. Anyone in the community can find a group and read it; members post to its own feed,
// comment and pray. Group posts never reach the main feed, the radio, search or digests. Any
// member can start a group and leads it; a group Prayer Tower starts has no member as leader.
// A person takes a post down (its author, the group's leader, or a moderator), never the app.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import { hasRole } from '../accounts/index.js';
import { requireFeature } from '../communities/index.js';

export const MAX_LED = 5;

export const NewGroup = z.object({ name: z.string().trim().min(1).max(60), about: z.string().trim().max(300).optional() });
export const NewPost = z.object({ body: z.string().trim().min(1).max(2000) });
export const NewComment = z.object({ body: z.string().trim().min(1).max(1000) });

type Group = { id: string; name: string; about: string | null; leader_id: string | null };

/** A group in the member's own community. */
async function groupOf(q: Queryable, userId: string, groupId: string): Promise<Group> {
  await requireFeature(q, userId, 'groups');
  const { rows } = await q.query<Group>(
    'select id, name, about, leader_id from public.topic_groups where id = $1 and community_id = public.member_community_id($2)',
    [groupId, userId],
  );
  if (!rows[0]) throw notFound('Group');
  return rows[0];
}

async function isMember(q: Queryable, userId: string, groupId: string) {
  const { rowCount } = await q.query('select 1 from public.topic_group_members where group_id = $1 and user_id = $2', [groupId, userId]);
  return !!rowCount;
}

async function requireMember(q: Queryable, userId: string, groupId: string) {
  if (!(await isMember(q, userId, groupId))) throw forbidden('Join the group first');
}

/** The leader or a moderator can take posts and comments down. */
async function canModerate(q: Queryable, userId: string, g: Group) {
  return g.leader_id === userId || (await hasRole(q, userId, 'admin', 'moderator'));
}

/** Every group in the member's community, the ones they belong to first, then the biggest. */
export async function list(q: Queryable, userId: string) {
  await requireFeature(q, userId, 'groups');
  const { rows } = await q.query<{ id: string; name: string; about: string | null; leader_id: string | null; leader_name: string | null; members: number; joined: boolean }>(
    `select g.id, g.name, g.about, g.leader_id, p.display_name as leader_name,
            (select count(*)::int from public.topic_group_members m where m.group_id = g.id) as members,
            exists (select 1 from public.topic_group_members m where m.group_id = g.id and m.user_id = $1) as joined
       from public.topic_groups g left join public.profiles p on p.id = g.leader_id
      where g.community_id = public.member_community_id($1)
        and not exists (select 1 from public.user_blocks b where b.user_id = $1 and b.blocked_id = g.leader_id)
      order by joined desc, members desc, g.name`,
    [userId],
  );
  return {
    groups: rows.map((r) => ({
      id: r.id,
      name: r.name,
      about: r.about,
      members: r.members,
      joined: r.joined,
      isLeader: r.leader_id === userId,
      leader: r.leader_id ? { id: r.leader_id, displayName: r.leader_name } : null,
    })),
  };
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewGroup>) {
  await requireFeature(q, userId, 'groups');
  const { rows: led } = await q.query<{ n: number }>('select count(*)::int as n from public.topic_groups where leader_id = $1', [userId]);
  if (led[0]!.n >= MAX_LED) throw badRequest(`You can lead up to ${MAX_LED} groups`);
  const { rows } = await q.query<{ id: string }>(
    'insert into public.topic_groups (community_id, name, about, leader_id) values (public.member_community_id($1), $2, $3, $1) returning id',
    [userId, input.name, input.about || null],
  );
  await q.query('insert into public.topic_group_members (group_id, user_id) values ($1, $2)', [rows[0]!.id, userId]);
  return { id: rows[0]!.id };
}

/** The group's page: about it, its leader, and its feed, newest first. People the viewer blocked are left out. */
export async function get(q: Queryable, userId: string, groupId: string) {
  const g = await groupOf(q, userId, groupId);
  const joined = await isMember(q, userId, groupId);
  const moderator = await canModerate(q, userId, g);
  const { rows: count } = await q.query<{ n: number; leader_name: string | null }>(
    `select (select count(*)::int from public.topic_group_members where group_id = $1) as n,
            (select display_name from public.profiles where id = $2) as leader_name`,
    [groupId, g.leader_id],
  );
  const blocked = `not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = x.user_id)`;
  const { rows: posts } = await q.query<{ id: string; user_id: string; name: string | null; body: string; created_at: Date; prayed: number; prayed_by_me: boolean }>(
    `select x.id, x.user_id, pr.display_name as name, x.body, x.created_at,
            (select count(*)::int from public.topic_group_prayers t where t.post_id = x.id) as prayed,
            exists (select 1 from public.topic_group_prayers t where t.post_id = x.id and t.user_id = $2) as prayed_by_me
       from public.topic_group_posts x join public.profiles pr on pr.id = x.user_id
      where x.group_id = $1 and ${blocked}
      order by x.created_at desc limit 50`,
    [groupId, userId],
  );
  const { rows: comments } = await q.query<{ id: string; post_id: string; user_id: string; name: string | null; body: string; created_at: Date }>(
    `select x.id, x.post_id, x.user_id, pr.display_name as name, x.body, x.created_at
       from public.topic_group_comments x join public.profiles pr on pr.id = x.user_id
      where x.post_id = any($1::uuid[]) and ${blocked}
      order by x.created_at`,
    [posts.map((p) => p.id), userId],
  );
  return {
    group: {
      id: g.id,
      name: g.name,
      about: g.about,
      members: count[0]!.n,
      joined,
      isLeader: g.leader_id === userId,
      leader: g.leader_id ? { id: g.leader_id, displayName: count[0]!.leader_name } : null,
    },
    posts: posts.map((p) => ({
      id: p.id,
      author: { id: p.user_id, displayName: p.name },
      body: p.body,
      createdAt: p.created_at.toISOString(),
      prayed: p.prayed,
      prayedByMe: p.prayed_by_me,
      canRemove: p.user_id === userId || moderator,
      comments: comments
        .filter((c) => c.post_id === p.id)
        .map((c) => ({
          id: c.id,
          author: { id: c.user_id, displayName: c.name },
          body: c.body,
          createdAt: c.created_at.toISOString(),
          canRemove: c.user_id === userId || moderator,
        })),
    })),
  };
}

export async function join(q: Queryable, userId: string, groupId: string) {
  await groupOf(q, userId, groupId);
  await q.query('insert into public.topic_group_members (group_id, user_id) values ($1, $2) on conflict do nothing', [groupId, userId]);
  return { joined: true };
}

/** Leave a group. If its leader leaves, the longest-standing member leads; with nobody left, Prayer Tower keeps it. */
export async function leave(q: Queryable, userId: string, groupId: string) {
  const g = await groupOf(q, userId, groupId);
  await q.query('delete from public.topic_group_members where group_id = $1 and user_id = $2', [groupId, userId]);
  if (g.leader_id === userId) {
    await q.query(
      `update public.topic_groups set leader_id = (select user_id from public.topic_group_members where group_id = $1 order by joined_at limit 1) where id = $1`,
      [groupId],
    );
  }
  return { left: true };
}

export async function post(q: Queryable, userId: string, groupId: string, body: string) {
  await groupOf(q, userId, groupId);
  await requireMember(q, userId, groupId);
  const { rows } = await q.query<{ id: string }>('insert into public.topic_group_posts (group_id, user_id, body) values ($1, $2, $3) returning id', [groupId, userId, body]);
  return { id: rows[0]!.id };
}

async function postOf(q: Queryable, userId: string, postId: string) {
  const { rows } = await q.query<{ group_id: string; user_id: string }>('select group_id, user_id from public.topic_group_posts where id = $1', [postId]);
  if (!rows[0]) throw notFound('Post');
  const g = await groupOf(q, userId, rows[0].group_id);
  return { ...rows[0], group: g };
}

export async function comment(q: Queryable, userId: string, postId: string, body: string) {
  const p = await postOf(q, userId, postId);
  await requireMember(q, userId, p.group_id);
  const { rows } = await q.query<{ id: string }>('insert into public.topic_group_comments (post_id, user_id, body) values ($1, $2, $3) returning id', [postId, userId, body]);
  return { id: rows[0]!.id };
}

export async function pray(q: Queryable, userId: string, postId: string) {
  const p = await postOf(q, userId, postId);
  await requireMember(q, userId, p.group_id);
  await q.query('insert into public.topic_group_prayers (post_id, user_id) values ($1, $2) on conflict do nothing', [postId, userId]);
  return { prayed: true };
}

export async function removePost(q: Queryable, userId: string, postId: string) {
  const p = await postOf(q, userId, postId);
  if (p.user_id !== userId && !(await canModerate(q, userId, p.group))) throw forbidden('Only the author, the group’s leader or a moderator can take this down');
  await q.query('delete from public.topic_group_posts where id = $1', [postId]);
  return { removed: true };
}

export async function removeComment(q: Queryable, userId: string, commentId: string) {
  const { rows } = await q.query<{ post_id: string; user_id: string }>('select post_id, user_id from public.topic_group_comments where id = $1', [commentId]);
  if (!rows[0]) throw notFound('Comment');
  const p = await postOf(q, userId, rows[0].post_id);
  if (rows[0].user_id !== userId && !(await canModerate(q, userId, p.group))) throw forbidden('Only the author, the group’s leader or a moderator can take this down');
  await q.query('delete from public.topic_group_comments where id = $1', [commentId]);
  return { removed: true };
}
