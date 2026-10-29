// Prayer circles (docs/GROWTH_PRACTICES.md): an invite-only small group, up to 12 people,
// with its own gentle feed. Everything stays inside the circle: circle posts never reach the
// main feed, the radio, search or digests. The kindness tools come along (the kind cloud on
// every post and reply, reply starters, a quiet heads-up instead of a push), and nobody but
// the person who asked sees how many prayed. The circle's starter can take down a post or
// remove someone; the app never does it on its own. Switch: practice_settings.prayer_circles_enabled.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import { getProfile } from '../accounts/index.js';
import * as notifications from '../notifications/index.js';
import { settings } from '../practices/index.js';

export const MAX_MEMBERS = 12;
export const MAX_OWNED = 5;
const INVITE_DAYS = 7;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const NewCircle = z.object({ name: z.string().trim().min(1).max(60), about: z.string().trim().max(300).optional() });
export const NewCirclePost = z.object({ body: z.string().trim().min(1).max(2000) });
export const NewCircleReply = z.object({ body: z.string().trim().min(1).max(1000) });
export const Welcome = z.object({ text: z.string().trim().max(400) });
export const Update = z.object({ text: z.string().trim().max(600), answered: z.boolean().default(false) });
export const Join = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/) });

async function requireOn(q: Queryable) {
  if (!(await settings(q)).prayer_circles_enabled) throw badRequest('Prayer circles are switched off');
}

async function circleOf(q: Queryable, userId: string, circleId: string) {
  const { rows } = await q.query<{ id: string; name: string; about: string | null; owner_id: string; welcome: string | null }>(
    `select c.id, c.name, c.about, c.owner_id, c.welcome from public.prayer_circles c
      join public.prayer_circle_members m on m.circle_id = c.id and m.user_id = $2
     where c.id = $1`,
    [circleId, userId],
  );
  if (!rows[0]) throw notFound('Circle');
  return rows[0];
}

async function postOf(q: Queryable, userId: string, postId: string) {
  const { rows } = await q.query<{ id: string; circle_id: string; user_id: string; owner_id: string; name: string }>(
    `select p.id, p.circle_id, p.user_id, c.owner_id, c.name from public.circle_posts p
      join public.prayer_circles c on c.id = p.circle_id
      join public.prayer_circle_members m on m.circle_id = p.circle_id and m.user_id = $2
     where p.id = $1`,
    [postId, userId],
  );
  if (!rows[0]) throw notFound('Circle post');
  return rows[0];
}

/** The circles the member belongs to. */
export async function mine(q: Queryable, userId: string) {
  if (!(await settings(q)).prayer_circles_enabled) return { enabled: false as const, circles: [] };
  const { rows } = await q.query<{ id: string; name: string; about: string | null; owner_id: string; members: number; last_at: Date | null }>(
    `select c.id, c.name, c.about, c.owner_id,
            (select count(*)::int from public.prayer_circle_members x where x.circle_id = c.id) as members,
            (select max(p.created_at) from public.circle_posts p where p.circle_id = c.id) as last_at
       from public.prayer_circles c join public.prayer_circle_members m on m.circle_id = c.id and m.user_id = $1
      order by coalesce((select max(p.created_at) from public.circle_posts p where p.circle_id = c.id), c.created_at) desc`,
    [userId],
  );
  return {
    enabled: true as const,
    circles: rows.map((r) => ({ id: r.id, name: r.name, about: r.about, isOwner: r.owner_id === userId, members: r.members, lastPostAt: r.last_at?.toISOString() ?? null })),
  };
}

export async function create(q: Queryable, userId: string, input: z.infer<typeof NewCircle>) {
  await requireOn(q);
  const { rows: owned } = await q.query<{ n: number }>('select count(*)::int as n from public.prayer_circles where owner_id = $1', [userId]);
  if (owned[0]!.n >= MAX_OWNED) throw badRequest(`You can start up to ${MAX_OWNED} circles`);
  const { rows } = await q.query<{ id: string }>('insert into public.prayer_circles (name, about, owner_id) values ($1, $2, $3) returning id', [
    input.name,
    input.about || null,
    userId,
  ]);
  await q.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2)', [rows[0]!.id, userId]);
  return { id: rows[0]!.id };
}

/** The circle's page: its members and the gentle feed, newest first. Posts from people the viewer blocked are left out. */
export async function get(q: Queryable, userId: string, circleId: string) {
  await requireOn(q);
  const c = await circleOf(q, userId, circleId);
  const isOwner = c.owner_id === userId;
  const { rows: members } = await q.query<{ id: string; display_name: string | null }>(
    `select p.id, p.display_name from public.prayer_circle_members m join public.profiles p on p.id = m.user_id where m.circle_id = $1 order by m.joined_at`,
    [circleId],
  );
  const blocked = `not exists (select 1 from public.user_blocks b where b.user_id = $2 and b.blocked_id = x.user_id)`;
  const { rows: posts } = await q.query<{ id: string; user_id: string; name: string | null; body: string; created_at: Date; prayed: number; prayed_by_me: boolean; update_text: string | null; update_at: Date | null; answered: boolean }>(
    `select x.id, x.user_id, pr.display_name as name, x.body, x.created_at, x.update_text, x.update_at, x.answered,
            (select count(*)::int from public.circle_prayed cp where cp.circle_post_id = x.id) as prayed,
            exists (select 1 from public.circle_prayed cp where cp.circle_post_id = x.id and cp.user_id = $2) as prayed_by_me
       from public.circle_posts x join public.profiles pr on pr.id = x.user_id
      where x.circle_id = $1 and ${blocked}
      order by x.created_at desc limit 50`,
    [circleId, userId],
  );
  const { rows: replies } = await q.query<{ id: string; circle_post_id: string; user_id: string; name: string | null; body: string; created_at: Date }>(
    `select x.id, x.circle_post_id, x.user_id, pr.display_name as name, x.body, x.created_at
       from public.circle_replies x join public.profiles pr on pr.id = x.user_id
      where x.circle_post_id = any($1::uuid[]) and ${blocked}
      order by x.created_at`,
    [posts.map((p) => p.id), userId],
  );
  let invite: { code: string; expiresAt: string } | null = null;
  if (isOwner) {
    const { rows } = await q.query<{ code: string; expires_at: Date }>('select code, expires_at from public.prayer_circle_invites where circle_id = $1 and expires_at > now()', [circleId]);
    invite = rows[0] ? { code: rows[0].code, expiresAt: rows[0].expires_at.toISOString() } : null;
  }
  const welcome = await welcomeFor(q, userId, c);
  const updates = (await settings(q)).circle_updates_enabled;
  return {
    circle: { id: c.id, name: c.name, about: c.about, isOwner, ownerId: c.owner_id, full: members.length >= MAX_MEMBERS },
    ...(welcome ? { welcome } : {}),
    members: members.map((m) => ({ id: m.id, displayName: m.display_name })),
    invite,
    posts: posts.map((p) => ({
      id: p.id,
      author: { id: p.user_id, displayName: p.name },
      body: p.body,
      createdAt: p.created_at.toISOString(),
      prayedByMe: p.prayed_by_me,
      // Only the person who asked sees how many prayed.
      ...(p.user_id === userId ? { prayed: p.prayed } : {}),
      ...(updates && (p.update_text || p.answered) ? { update: { text: p.update_text, answered: p.answered, at: (p.update_at ?? p.created_at).toISOString() } } : {}),
      replies: replies
        .filter((r) => r.circle_post_id === p.id)
        .map((r) => ({ id: r.id, author: { id: r.user_id, displayName: r.name }, body: r.body, createdAt: r.created_at.toISOString() })),
    })),
  };
}

/** The starter makes a fresh invite code (good for 7 days); it replaces the old one. */
export async function invite(q: Queryable, userId: string, circleId: string) {
  await requireOn(q);
  const c = await circleOf(q, userId, circleId);
  if (c.owner_id !== userId) throw forbidden('Only the person who started the circle can invite');
  const code = Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
  const { rows } = await q.query<{ expires_at: Date }>(
    `insert into public.prayer_circle_invites (code, circle_id, created_by, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))
     on conflict (circle_id) do update set code = excluded.code, created_by = excluded.created_by, expires_at = excluded.expires_at, created_at = now()
     returning expires_at`,
    [code, circleId, userId, INVITE_DAYS],
  );
  return { code, expiresAt: rows[0]!.expires_at.toISOString() };
}

/** Join with a code. Never into a circle whose starter blocked you or whom you blocked. */
export async function join(q: Queryable, userId: string, code: string) {
  await requireOn(q);
  const { rows } = await q.query<{ circle_id: string; owner_id: string; members: number }>(
    `select i.circle_id, c.owner_id, (select count(*)::int from public.prayer_circle_members m where m.circle_id = i.circle_id) as members
       from public.prayer_circle_invites i join public.prayer_circles c on c.id = i.circle_id
      where i.code = $1 and i.expires_at > now()
        and not exists (select 1 from public.user_blocks b where (b.user_id = c.owner_id and b.blocked_id = $2) or (b.user_id = $2 and b.blocked_id = c.owner_id))`,
    [code, userId],
  );
  const r = rows[0];
  if (!r) throw notFound('Invite');
  if (r.members >= MAX_MEMBERS) throw conflict('This circle is full');
  await q.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2) on conflict do nothing', [r.circle_id, userId]);
  return { id: r.circle_id };
}

/** Leave a circle. If the starter leaves, the longest-standing member takes over; an empty circle is gone. */
export async function leave(q: Queryable, userId: string, circleId: string) {
  await requireOn(q);
  const c = await circleOf(q, userId, circleId);
  await q.query('delete from public.prayer_circle_members where circle_id = $1 and user_id = $2', [circleId, userId]);
  if (c.owner_id === userId) {
    const { rows } = await q.query<{ user_id: string }>('select user_id from public.prayer_circle_members where circle_id = $1 order by joined_at limit 1', [circleId]);
    if (rows[0]) {
      await q.query('update public.prayer_circles set owner_id = $2 where id = $1', [circleId, rows[0].user_id]);
      await q.query('delete from public.prayer_circle_invites where circle_id = $1', [circleId]);
    } else await q.query('delete from public.prayer_circles where id = $1', [circleId]);
  }
  return { left: true };
}

/** The starter removes someone. Their posts stay unless taken down one by one. */
export async function removeMember(q: Queryable, userId: string, circleId: string, memberId: string) {
  await requireOn(q);
  const c = await circleOf(q, userId, circleId);
  if (c.owner_id !== userId) throw forbidden('Only the person who started the circle can do that');
  if (memberId === userId) throw badRequest('Use Leave instead');
  const { rowCount } = await q.query('delete from public.prayer_circle_members where circle_id = $1 and user_id = $2', [circleId, memberId]);
  if (!rowCount) throw notFound('Member');
  return { removed: true };
}

/** Post to the circle. The others get one quiet heads-up a day per circle, in-app only. */
export async function post(q: Queryable, userId: string, circleId: string, body: string) {
  await requireOn(q);
  const c = await circleOf(q, userId, circleId);
  const { rows } = await q.query<{ id: string }>('insert into public.circle_posts (circle_id, user_id, body) values ($1, $2, $3) returning id', [circleId, userId, body]);
  await nudgeHello(q, userId, c);
  const { rows: others } = await q.query<{ user_id: string }>('select user_id from public.prayer_circle_members where circle_id = $1 and user_id <> $2', [circleId, userId]);
  const day = new Date().toISOString().slice(0, 10);
  for (const o of others) {
    await notifications.notify(q, o.user_id, {
      kind: 'circle_post',
      title: c.name,
      body: 'Someone in your circle shared something new.',
      data: { screen: 'circle', circleId },
      dedupeKey: `circle_post:${circleId}:${day}`,
      quiet: true,
    });
  }
  return { id: rows[0]!.id };
}

export async function reply(q: Queryable, userId: string, postId: string, body: string) {
  await requireOn(q);
  const p = await postOf(q, userId, postId);
  const { rows } = await q.query<{ id: string }>('insert into public.circle_replies (circle_post_id, user_id, body) values ($1, $2, $3) returning id', [postId, userId, body]);
  if (p.user_id !== userId) {
    const who = (await getProfile(q, userId))?.display_name || 'Someone';
    await notifications.notify(q, p.user_id, {
      kind: 'circle_post',
      title: p.name,
      body: `${who} replied to what you shared.`,
      data: { screen: 'circle', circleId: p.circle_id },
      dedupeKey: `circle_reply:${postId}:${userId}`,
      quiet: true,
    });
  }
  return { id: rows[0]!.id };
}

export async function pray(q: Queryable, userId: string, postId: string) {
  await requireOn(q);
  await postOf(q, userId, postId);
  await q.query('insert into public.circle_prayed (circle_post_id, user_id) values ($1, $2) on conflict do nothing', [postId, userId]);
  return { prayed: true };
}

/** Circle updates (off): the author shares how it's going, or that it was answered. Those who prayed hear quietly. */
export async function update(q: Queryable, userId: string, postId: string, input: z.infer<typeof Update>) {
  await requireOn(q);
  if (!(await settings(q)).circle_updates_enabled) throw badRequest('Circle updates are off');
  const p = await postOf(q, userId, postId);
  if (p.user_id !== userId) throw forbidden('Only the person who shared this can update it');
  if (!input.text && !input.answered) throw badRequest('Write a few words, or mark it answered');
  await q.query("update public.circle_posts set update_text = nullif($2, ''), update_at = now(), answered = $3 where id = $1", [postId, input.text, input.answered]);
  const { rows: prayed } = await q.query<{ user_id: string }>(
    'select cp.user_id from public.circle_prayed cp join public.prayer_circle_members m on m.user_id = cp.user_id and m.circle_id = $2 where cp.circle_post_id = $1 and cp.user_id <> $3',
    [postId, p.circle_id, userId],
  );
  const who = (await getProfile(q, userId))?.display_name || 'Someone';
  for (const o of prayed) {
    await notifications.notify(q, o.user_id, {
      kind: 'circle_post',
      title: p.name,
      body: input.answered ? `${who} shared good news about what they asked for.` : `${who} shared how it's going.`,
      data: { screen: 'circle', circleId: p.circle_id },
      dedupeKey: `circle_update:${postId}:${input.answered ? 'answered' : new Date().toISOString().slice(0, 10)}`,
      quiet: true,
    });
  }
  return { ok: true };
}

/** The author or the circle's starter takes a post down: a person decides, never the app. */
export async function removePost(q: Queryable, userId: string, postId: string) {
  await requireOn(q);
  const p = await postOf(q, userId, postId);
  if (p.user_id !== userId && p.owner_id !== userId) throw forbidden('Only the author or the circle’s starter can take this down');
  await q.query('delete from public.circle_posts where id = $1', [postId]);
  return { removed: true };
}

// Circle welcome (research/Conflict_Repair_and_Newcomer_Kindness.md, suggestion 1) --------
// The starter writes a short welcome (the circle's norms). Someone who hasn't yet posted or
// replied in the circle sees it above the composer until they dismiss it, and the starter gets
// a quiet nudge to say hello when someone shares for the first time.
// Switch: practice_settings.circle_welcome_enabled (with prayer circles on).

async function welcomeOn(q: Queryable) {
  const s = await settings(q);
  return s.prayer_circles_enabled && s.circle_welcome_enabled;
}

/** The welcome as the viewer sees it: its text (null = the app's default words) and whether to show it. */
async function welcomeFor(q: Queryable, userId: string, c: { id: string; owner_id: string; welcome: string | null }) {
  if (!(await welcomeOn(q))) return null;
  if (c.owner_id === userId) return { text: c.welcome, show: false };
  const { rows } = await q.query<{ quiet: boolean }>(
    `select not exists (select 1 from public.circle_posts p where p.circle_id = $1 and p.user_id = $2)
        and not exists (select 1 from public.circle_replies r join public.circle_posts p on p.id = r.circle_post_id where p.circle_id = $1 and r.user_id = $2)
        and not exists (select 1 from public.circle_welcome_seen w where w.circle_id = $1 and w.user_id = $2) as quiet`,
    [c.id, userId],
  );
  return { text: c.welcome, show: rows[0]!.quiet };
}

/** The starter writes or clears the welcome. An empty text goes back to the app's default. */
export async function setWelcome(q: Queryable, userId: string, circleId: string, text: string) {
  if (!(await welcomeOn(q))) throw badRequest('Circle welcomes are switched off');
  const c = await circleOf(q, userId, circleId);
  if (c.owner_id !== userId) throw forbidden('Only the person who started the circle can write its welcome');
  await q.query('update public.prayer_circles set welcome = $2 where id = $1', [circleId, text || null]);
  return { welcome: text || null };
}

export async function welcomeSeen(q: Queryable, userId: string, circleId: string) {
  await requireOn(q);
  await circleOf(q, userId, circleId);
  await q.query('insert into public.circle_welcome_seen (circle_id, user_id) values ($1, $2) on conflict do nothing', [circleId, userId]);
  return { seen: true };
}

/** After someone's first post in a circle: a quiet nudge to the starter to say hello. */
async function nudgeHello(q: Queryable, userId: string, c: { id: string; name: string; owner_id: string }) {
  if (c.owner_id === userId || !(await welcomeOn(q))) return;
  const { rows } = await q.query<{ n: number }>('select count(*)::int as n from public.circle_posts where circle_id = $1 and user_id = $2', [c.id, userId]);
  if (rows[0]!.n !== 1) return;
  const who = (await getProfile(q, userId))?.display_name || 'Someone';
  await notifications.notify(q, c.owner_id, {
    kind: 'circle_post',
    title: c.name,
    body: `${who} shared in your circle for the first time. A hello goes a long way.`,
    data: { screen: 'circle', circleId: c.id },
    dedupeKey: `circle_hello:${c.id}:${userId}`,
    quiet: true,
  });
}
