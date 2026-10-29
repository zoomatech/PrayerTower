// Private kindness milestones (docs/GROWTH_PRACTICES.md): quiet markers only the member
// sees, worked out from what they've already done. Counts only grow, so nothing can be
// lost; there is no leaderboard, no ranking and no comparison with anyone, and admins
// get no view of it. Answered prayers are never counted. Switch:
// practice_settings.kind_milestones_enabled, off.
import type { Queryable } from '../../db.js';
import { settings } from '../practices/index.js';

const LEVELS = [1, 10, 25, 50, 100, 250, 500, 1000] as const;
const METRICS = ['people', 'requests', 'encouragements', 'checkins', 'words'] as const;
type Metric = (typeof METRICS)[number];

// Only kindness toward others: the member's own posts never count.
const COUNTS = `
  select
    (select count(distinct p.user_id)::int from public.prayer_events e join public.posts p on p.id = e.post_id
      where e.user_id = $1 and p.user_id <> $1) as people,
    (select count(distinct e.post_id)::int from public.prayer_events e join public.posts p on p.id = e.post_id
      where e.user_id = $1 and p.user_id <> $1) as requests,
    (select count(*)::int from public.reactions r join public.posts p on p.id = r.post_id
      where r.user_id = $1 and r.kind = 'encouragement' and p.user_id <> $1) as encouragements,
    (select count(*)::int from public.prayer_events e where e.user_id = $1 and e.kind = 'commitment_checkin') as checkins,
    (select count(*)::int from public.comments c join public.posts p on p.id = c.post_id
      where c.user_id = $1 and p.user_id <> $1 and c.moderation_status = 'visible') as words`;

export async function mine(q: Queryable, userId: string) {
  if (!(await settings(q)).kind_milestones_enabled) return { enabled: false as const, milestones: [] };
  const { rows } = await q.query<Record<Metric, number>>(COUNTS, [userId]);
  const counts = rows[0]!;
  const { rows: seen } = await q.query<{ metric: string; level: number }>('select metric, level from public.kind_milestones_seen where user_id = $1', [userId]);
  const was = new Set(seen.map((s) => `${s.metric}:${s.level}`));
  // The highest level reached for each kind of kindness; nothing shown for one not yet begun.
  const milestones = METRICS.flatMap((metric) => {
    const level = [...LEVELS].reverse().find((l) => counts[metric] >= l);
    return level ? [{ metric, level, count: counts[metric], new: !was.has(`${metric}:${level}`) }] : [];
  });
  return { enabled: true as const, milestones };
}

/** Mark the milestones shown as seen, so each is greeted only once. */
export async function markSeen(q: Queryable, userId: string) {
  const r = await mine(q, userId);
  for (const m of r.milestones) {
    await q.query('insert into public.kind_milestones_seen (user_id, metric, level) values ($1, $2, $3) on conflict do nothing', [userId, m.metric, m.level]);
  }
  return mine(q, userId);
}
