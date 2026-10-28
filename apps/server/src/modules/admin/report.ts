// Pilot results for the sponsorship ask (Epic 9): week-by-week activity, as
// JSON for the Admin screen and CSV for a spreadsheet.
import type { Queryable } from '../../db.js';

export interface PilotWeek {
  week_start: string;
  new_members: number;
  requests_posted: number;
  prayers_answered: number;
  praying_now_taps: number;
  active_pray_ers: number;
  commitments_made: number;
  commitment_checkins: number;
  encouragements: number;
  moderation_items: number;
  removals: number;
}

export async function weekly(q: Queryable, weeks: number): Promise<PilotWeek[]> {
  const { rows } = await q.query<PilotWeek>(
    `with w as (
       select generate_series(date_trunc('week', now()) - ($1::int - 1) * interval '1 week', date_trunc('week', now()), interval '1 week') as s
     )
     select to_char(w.s, 'YYYY-MM-DD') as week_start,
       (select count(*) from public.profiles p where p.created_at >= w.s and p.created_at < w.s + interval '1 week')::int as new_members,
       (select count(*) from public.posts p where p.post_type = 'prayer_request' and p.created_at >= w.s and p.created_at < w.s + interval '1 week')::int as requests_posted,
       (select count(*) from public.posts p where p.answered_at >= w.s and p.answered_at < w.s + interval '1 week')::int as prayers_answered,
       (select count(*) from public.prayer_events e where e.kind = 'praying_now' and e.created_at >= w.s and e.created_at < w.s + interval '1 week')::int as praying_now_taps,
       (select count(distinct e.user_id) from public.prayer_events e where e.created_at >= w.s and e.created_at < w.s + interval '1 week')::int as active_pray_ers,
       (select count(*) from public.commitments c where c.created_at >= w.s and c.created_at < w.s + interval '1 week')::int as commitments_made,
       (select count(*) from public.prayer_events e where e.kind = 'commitment_checkin' and e.created_at >= w.s and e.created_at < w.s + interval '1 week')::int as commitment_checkins,
       (select count(*) from public.reactions r where r.kind = 'encouragement' and r.created_at >= w.s and r.created_at < w.s + interval '1 week')::int as encouragements,
       (select count(*) from public.moderation_items m where m.created_at >= w.s and m.created_at < w.s + interval '1 week')::int as moderation_items,
       (select count(*) from public.moderation_actions a where a.action = 'remove' and a.created_at >= w.s and a.created_at < w.s + interval '1 week')::int as removals
     from w order by w.s`,
    [weeks],
  );
  return rows;
}

export function toCsv(rows: PilotWeek[]): string {
  const cols = Object.keys(rows[0] ?? { week_start: '' }) as (keyof PilotWeek)[];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => r[c]).join(','))].join('\n') + '\n';
}
