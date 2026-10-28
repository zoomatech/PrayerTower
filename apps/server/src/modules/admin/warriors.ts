// Prayer Warrior standings (Business Plan 6.4, Annual Prayer Warrior Award).
// Admin-only and private: the award itself waits on a lawyer (contest rules)
// and money, so this only ranks verified prayers for others and kept promises.
import type { Queryable } from '../../db.js';

export async function standings(q: Queryable, days: number, limit = 50) {
  const { rows } = await q.query<{ user_id: string; name: string; prayers: number; checkins: number; people: number }>(
    `select e.user_id, coalesce(nullif(p.display_name, ''), 'Member') as name,
            count(*) filter (where e.commitment_id is null)::int as prayers,
            count(*) filter (where e.commitment_id is not null)::int as checkins,
            count(distinct po.user_id)::int as people
       from public.prayer_events e
       join public.posts po on po.id = e.post_id and po.user_id <> e.user_id
       join public.profiles p on p.id = e.user_id and p.deleted_at is null
      where e.verified and e.created_at > now() - make_interval(days => $1)
      group by e.user_id, p.display_name
      order by count(*) desc, count(distinct po.user_id) desc
      limit $2`,
    [days, limit],
  );
  return rows.map((r, i) => ({ rank: i + 1, userId: r.user_id, name: r.name, prayers: r.prayers, checkins: r.checkins, peoplePrayedFor: r.people }));
}
