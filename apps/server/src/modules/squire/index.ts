// Prayer Squire board (PrayerTower_ConceptDoc, Status Tiers): the public track. Off by
// default. A member chooses to appear; anonymous-by-default members are on the private
// Prayer Warrior track and never appear, even if they opted in earlier. The board
// counts verified prayers for other people in the last `squire_board_days` days, only
// among members of the viewer's community, and leaves out anyone either side blocked.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { forbidden } from '../../errors.js';

export const BOARD_SIZE = 20;

async function settings(q: Queryable) {
  const { rows } = await q.query<{ on: boolean; days: number }>('select squire_board_enabled as on, squire_board_days as days from public.notebook_settings');
  return rows[0] ?? { on: false, days: 30 };
}

async function standing(q: Queryable, userId: string) {
  const { rows } = await q.query<{ squire_public: boolean; anonymous_by_default: boolean }>(
    'select squire_public, anonymous_by_default from public.profiles where id = $1',
    [userId],
  );
  return rows[0] ?? { squire_public: false, anonymous_by_default: false };
}

export async function board(q: Queryable, viewerId: string) {
  const s = await settings(q);
  if (!s.on) return { enabled: false as const };
  const me = await standing(q, viewerId);
  const { rows } = await q.query<{ user_id: string; name: string; prayers: number; people: number }>(
    `select e.user_id, coalesce(nullif(p.display_name, ''), 'Member') as name,
            count(*)::int as prayers, count(distinct po.user_id)::int as people
       from public.prayer_events e
       join public.posts po on po.id = e.post_id and po.user_id <> e.user_id
       join public.profiles p on p.id = e.user_id and p.deleted_at is null and p.squire_public and not p.anonymous_by_default
      where e.verified and e.created_at > now() - make_interval(days => $2::int)
        and public.member_community_id(e.user_id) is not distinct from public.member_community_id($1)
        and not exists (select 1 from public.user_blocks b where (b.user_id = $1 and b.blocked_id = e.user_id) or (b.user_id = e.user_id and b.blocked_id = $1))
      group by e.user_id, p.display_name
      order by count(*) desc, count(distinct po.user_id) desc, e.user_id
      limit $3`,
    [viewerId, s.days, BOARD_SIZE],
  );
  return {
    enabled: true as const,
    days: s.days,
    /** True while this member shows on the board; anonymous members can't. */
    onBoard: me.squire_public && !me.anonymous_by_default,
    canJoin: !me.anonymous_by_default,
    entries: rows.map((r, i) => ({ rank: i + 1, personId: r.user_id, name: r.name, prayers: r.prayers, peoplePrayedFor: r.people, you: r.user_id === viewerId })),
  };
}

export const Choice = z.object({ public: z.boolean() });

export async function choose(q: Queryable, userId: string, input: z.infer<typeof Choice>) {
  const s = await settings(q);
  if (!s.on) throw forbidden('The Prayer Squire board is off');
  if (input.public && (await standing(q, userId)).anonymous_by_default) throw forbidden('Anonymous members pray on the private track');
  await q.query('update public.profiles set squire_public = $2 where id = $1', [userId, input.public]);
  return board(q, userId);
}
