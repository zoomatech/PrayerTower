// The member safety center (docs/SAFETY_CENTER.md), off by default: in one place, the
// people you blocked or muted, the posts you hid and the reports you made, each with
// a way to undo, plus how to report and where to get help. Muting is quieter than
// blocking: their posts and comments leave your feed, nothing else changes, and they
// are not told.
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as messages from '../messages/index.js';

export async function enabled(q: Queryable): Promise<boolean> {
  const { rows } = await q.query<{ enabled: boolean }>('select enabled from public.safety_center_settings');
  return rows[0]?.enabled === true;
}

export async function setEnabled(q: Queryable, on: boolean) {
  await q.query('update public.safety_center_settings set enabled = $1, updated_at = now()', [on]);
  return { enabled: on };
}

export const features = async (q: Queryable) => ({ safetyCenter: await enabled(q) });

async function requireOn(q: Queryable) {
  if (!(await enabled(q))) throw forbidden('The safety center is switched off');
}

export async function mute(q: Queryable, userId: string, mutedId: string) {
  await requireOn(q);
  if (userId === mutedId) throw badRequest("You can't mute yourself");
  const { rowCount } = await q.query('select 1 from public.profiles where id = $1 and deleted_at is null', [mutedId]);
  if (!rowCount) throw notFound('Person');
  await q.query('insert into public.user_mutes (user_id, muted_id) values ($1, $2) on conflict do nothing', [userId, mutedId]);
}

export async function unmute(q: Queryable, userId: string, mutedId: string) {
  await q.query('delete from public.user_mutes where user_id = $1 and muted_id = $2', [userId, mutedId]);
}

export async function isMuted(q: Queryable, userId: string, otherId: string) {
  const { rowCount } = await q.query('select 1 from public.user_mutes where user_id = $1 and muted_id = $2', [userId, otherId]);
  return !!rowCount;
}

/** Everything the member has done to stay safe, newest first, each undoable. */
export async function overview(q: Queryable, userId: string) {
  await requireOn(q);
  const { rows: mutes } = await q.query<{ id: string; display_name: string; muted_at: Date }>(
    `select p.id, p.display_name, m.created_at as muted_at
       from public.user_mutes m join public.profiles p on p.id = m.muted_id
      where m.user_id = $1 order by m.created_at desc`,
    [userId],
  );
  const { rows: hidden } = await q.query<{ id: string; excerpt: string; hidden_at: Date }>(
    `select p.id, left(p.body, 80) as excerpt, h.created_at as hidden_at
       from public.hidden_posts h join public.posts p on p.id = h.post_id
      where h.user_id = $1 and p.moderation_status = 'visible' order by h.created_at desc limit 100`,
    [userId],
  );
  // Your reports: what kind of thing, when, and whether a moderator has looked. Never what they decided about the other person.
  const { rows: reports } = await q.query<{ id: string; target_type: string; created_at: Date; reviewed: boolean }>(
    `select id, target_type::text, created_at, status <> 'pending' as reviewed
       from public.moderation_items where reporter_id = $1 order by created_at desc limit 50`,
    [userId],
  );
  return {
    blocks: await messages.blocks(q, userId),
    mutes: mutes.map((m) => ({ id: m.id, displayName: m.display_name || 'Member', mutedAt: m.muted_at })),
    hidden: hidden.map((h) => ({ id: h.id, excerpt: h.excerpt, hiddenAt: h.hidden_at })),
    reports: reports.map((r) => ({ id: r.id, targetType: r.target_type, createdAt: r.created_at, reviewed: r.reviewed })),
  };
}
