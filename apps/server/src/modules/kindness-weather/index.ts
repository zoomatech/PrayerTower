// Kindness weather report (docs/CONVERSATION_HELPERS.md): an anonymous weekly view of the
// community's tone for admins. It is built only from totals: warm signals (hearts from the
// asker, thank-yous, thank-you notes and "Glad to") against heated ones (replies the kind
// cloud flagged and member reports). There is no per-member score, and a week with fewer
// than five comments is folded as "too quiet to say". Switch: practice_settings.kindness_weather_enabled.
import type { Queryable } from '../../db.js';
import { settings } from '../practices/index.js';

/** Weeks with fewer comments than this show no numbers. */
export const QUIET_BELOW = 5;

export type Weather = 'sunny' | 'fair' | 'cloudy' | 'stormy' | 'quiet';

export interface WeatherWeek {
  weekStart: string;
  weather: Weather;
  /** Null while the week is folded. */
  comments: number | null;
  warm: number | null;
  heated: number | null;
  prayers: number | null;
  /** Different people who commented: whether calmer weeks keep people talking (Steve's question, Notes p2). */
  people: number | null;
}

/** Heat per comment decides the sky; a warm week with little heat is sunny. */
export function skyFor(comments: number, warm: number, heated: number): Weather {
  if (comments < QUIET_BELOW) return 'quiet';
  const heat = heated / comments;
  if (heat < 0.02 && warm / comments >= 0.1) return 'sunny';
  if (heat < 0.05) return 'fair';
  if (heat < 0.12) return 'cloudy';
  return 'stormy';
}

export async function report(q: Queryable, weeks = 12) {
  if (!(await settings(q)).kindness_weather_enabled) return { enabled: false as const, weeks: [] as WeatherWeek[] };
  const { rows } = await q.query<{ week: Date; comments: number; warm: number; heated: number; prayers: number; people: number }>(
    `with w as (
       select generate_series(date_trunc('week', now()) - make_interval(weeks => $1 - 1), date_trunc('week', now()), interval '1 week') as week
     )
     select w.week,
       (select count(*)::int from public.comments c where c.created_at >= w.week and c.created_at < w.week + interval '1 week') as comments,
       (select count(*)::int from public.comment_hearts h where h.created_at >= w.week and h.created_at < w.week + interval '1 week')
       + (select count(*)::int from public.comment_thanks t where t.created_at >= w.week and t.created_at < w.week + interval '1 week')
       + (select count(*)::int from public.thank_notes n where n.created_at >= w.week and n.created_at < w.week + interval '1 week')
       + (select count(*)::int from public.thank_note_glad g where g.created_at >= w.week and g.created_at < w.week + interval '1 week') as warm,
       (select count(*)::int from public.heated_comments h where h.created_at >= w.week and h.created_at < w.week + interval '1 week')
       + (select count(*)::int from public.heated_replies h where h.created_at >= w.week and h.created_at < w.week + interval '1 week')
       + (select count(*)::int from public.moderation_items m where m.source = 'report' and m.created_at >= w.week and m.created_at < w.week + interval '1 week') as heated,
       (select count(*)::int from public.prayer_events e where e.created_at >= w.week and e.created_at < w.week + interval '1 week') as prayers,
       (select count(distinct c.user_id)::int from public.comments c where c.created_at >= w.week and c.created_at < w.week + interval '1 week') as people
     from w order by w.week desc`,
    [weeks],
  );
  return {
    enabled: true as const,
    weeks: rows.map((r): WeatherWeek => {
      const weather = skyFor(r.comments, r.warm, r.heated);
      const show = weather !== 'quiet';
      return {
        weekStart: r.week.toISOString().slice(0, 10),
        weather,
        comments: show ? r.comments : null,
        warm: show ? r.warm : null,
        heated: show ? r.heated : null,
        prayers: show ? r.prayers : null,
        people: show ? r.people : null,
      };
    }),
  };
}

/** Community health (Admin → Growth practices, off): what matters, never time spent in the app. */
export interface HealthWeek {
  weekStart: string;
  /** Null while the week is folded (fewer than QUIET_BELOW requests). */
  requests: number | null;
  /** Requests someone else prayed for or answered within two days. */
  held: number | null;
  answered: number | null;
  /** Members active this week who were also active in the four weeks before. */
  returning: number | null;
}

export async function health(q: Queryable, weeks = 12) {
  if (!(await settings(q)).community_health_enabled) return { enabled: false as const, weeks: [] as HealthWeek[] };
  const { rows } = await q.query<{ week: Date; requests: number; held: number; answered: number; returning: number }>(
    `with w as (
       select generate_series(date_trunc('week', now()) - make_interval(weeks => $1 - 1), date_trunc('week', now()), interval '1 week') as week
     ),
     active as (
       select user_id, created_at from public.prayer_events
       union all select user_id, created_at from public.posts
       union all select user_id, created_at from public.comments
     )
     select w.week,
       (select count(*)::int from public.posts p where p.post_type = 'prayer_request' and p.created_at >= w.week and p.created_at < w.week + interval '1 week') as requests,
       (select count(*)::int from public.posts p
         where p.post_type = 'prayer_request' and p.created_at >= w.week and p.created_at < w.week + interval '1 week'
           and (exists (select 1 from public.prayer_events e where e.post_id = p.id and e.user_id <> p.user_id and e.created_at < p.created_at + interval '2 days')
             or exists (select 1 from public.comments c where c.post_id = p.id and c.user_id <> p.user_id and c.created_at < p.created_at + interval '2 days'))) as held,
       (select count(*)::int from public.posts p where p.answered_at >= w.week and p.answered_at < w.week + interval '1 week') as answered,
       (select count(distinct a.user_id)::int from active a
         where a.created_at >= w.week and a.created_at < w.week + interval '1 week'
           and exists (select 1 from active b where b.user_id = a.user_id and b.created_at >= w.week - interval '4 weeks' and b.created_at < w.week)) as returning
     from w order by w.week desc`,
    [weeks],
  );
  return {
    enabled: true as const,
    weeks: rows.map((r): HealthWeek => {
      const show = r.requests >= QUIET_BELOW;
      return {
        weekStart: r.week.toISOString().slice(0, 10),
        requests: show ? r.requests : null,
        held: show ? r.held : null,
        answered: show ? r.answered : null,
        returning: show ? r.returning : null,
      };
    }),
  };
}
