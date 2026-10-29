// Admin → Safety dashboard (docs/HARMFUL_PRAYERS.md, "Safety dashboard"), off by default:
// what is held now, how fast held posts get a person, where the on-call rota has gaps,
// and what was restored. Counts and names of staff only, never member text.
import type { Queryable } from '../../db.js';
import * as oncall from './oncall.js';

export interface Gap {
  weekday: number;
  start_minute: number;
  end_minute: number;
}

/** The stretches of each weekday with nobody on call (in the rota's time zone). */
export function coverageGaps(shifts: { weekday: number; start_minute: number; end_minute: number }[]): Gap[] {
  const gaps: Gap[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const day = shifts.filter((s) => s.weekday === weekday).sort((a, b) => a.start_minute - b.start_minute);
    let covered = 0;
    for (const s of day) {
      if (s.start_minute > covered) gaps.push({ weekday, start_minute: covered, end_minute: s.start_minute });
      covered = Math.max(covered, s.end_minute);
    }
    if (covered < 1440) gaps.push({ weekday, start_minute: covered, end_minute: 1440 });
  }
  return gaps;
}

export async function dashboard(q: Queryable, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rota = await oncall.settings(q);

  const { rows: held } = await q.query<{ source: string; held: number; oldest_minutes: number | null; over_limit: number }>(
    `select m.source::text, count(*)::int as held,
            floor(extract(epoch from now() - min(m.created_at)) / 60)::int as oldest_minutes,
            count(*) filter (where m.created_at < now() - make_interval(mins => $1))::int as over_limit
       from public.moderation_items m
      where m.status = 'pending' and m.auto_hidden
      group by m.source order by held desc`,
    [rota.max_wait_minutes],
  );

  const { rows: response } = await q.query<{ decided: number; median_minutes: number | null; p90_minutes: number | null; within_limit: number }>(
    `select count(*)::int as decided,
            round((percentile_cont(0.5) within group (order by extract(epoch from m.decided_at - m.created_at) / 60))::numeric, 1)::float as median_minutes,
            round((percentile_cont(0.9) within group (order by extract(epoch from m.decided_at - m.created_at) / 60))::numeric, 1)::float as p90_minutes,
            count(*) filter (where m.decided_at - m.created_at <= make_interval(mins => $2))::int as within_limit
       from public.moderation_items m
      where m.auto_hidden and m.decided_at is not null and m.decided_at >= $1`,
    [since, rota.max_wait_minutes],
  );

  const { rows: alerts } = await q.query<{ reminded: number; escalated: number }>(
    `select count(*) filter (where oncall_reminded_at >= $1)::int as reminded,
            count(*) filter (where oncall_escalated_at >= $1)::int as escalated
       from public.moderation_items`,
    [since],
  );

  const { rows: restores } = await q.query<{ moderator: string | null; restores: number }>(
    `select p.display_name as moderator, count(*)::int as restores
       from public.moderation_actions a left join public.profiles p on p.id = a.moderator_id
      where a.action = 'restore' and a.created_at >= $1
      group by p.display_name order by restores desc`,
    [since],
  );
  const { rows: appeals } = await q.query<{ overturned: number; upheld: number }>(
    `select count(*) filter (where status = 'overturned')::int as overturned, count(*) filter (where status = 'upheld')::int as upheld
       from public.moderation_appeals where decided_at >= $1`,
    [since],
  );

  const shifts = await oncall.shifts(q);
  return {
    days,
    maxWaitMinutes: rota.max_wait_minutes,
    held,
    response: response[0]!,
    alerts: alerts[0]!,
    restores,
    appeals: appeals[0]!,
    rota: { enabled: rota.enabled, timezone: rota.timezone, shifts: shifts.length, gaps: coverageGaps(shifts) },
  };
}
