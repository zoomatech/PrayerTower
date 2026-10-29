// Gentle prayer stats for the member's own Me page: days prayed, people and
// requests prayed for, and a streak. Only the member sees them, they can be
// turned off, and nothing here ranks members against each other.
import type { Queryable } from '../../db.js';
import { freshDay, type FreshDay } from '../fresh-days/index.js';
import { settings as practiceSettings } from '../practices/index.js';
import { weeksOfPrayer } from '../reminders/index.js';

export interface PrayerStats {
  enabled: boolean;
  daysPrayed: number;
  peoplePrayedFor: number;
  requestsPrayedFor: number;
  /** Days in a row, counting today or, if not yet today, yesterday. */
  currentStreak: number;
  longestStreak: number;
  /** The last seven days, oldest first, in the member's time zone. */
  week: { date: string; prayed: boolean }[];
  /** Gentle rhythm (modules/practices): days prayed this calendar month. */
  monthDays: number;
  /** The last prayer before today was a week or more ago. */
  welcomeBack: boolean;
  /** Monday or the 1st of the month, in the member's time zone. */
  freshStart: 'week' | 'month' | null;
  /** Weeks of prayer (modules/reminders): weeks with a prayer, a total that only grows. */
  weeksPrayed: number;
  /** Weeks in a row allowing one rest week between; null under 2. */
  weekRun: number | null;
  /** Weekly intention (Admin → Growth practices, off): present only while the switch is on. */
  intention?: Intention;
  /** Fresh starts on days that matter (off): the member's own day or a season's first day, else null. */
  freshDay?: FreshDay | null;
}

export interface Intention {
  /** Days a week the member means to pray, 1 to 6; null when they haven't chosen. */
  days: number | null;
  /** This week, Monday first. Days still to come are `prayed: false`. */
  week: { date: string; prayed: boolean }[];
  shown: number;
  /** The intention is met; it is never said when it isn't. */
  met: boolean;
}

/** This week (Monday to Sunday) from the member's prayer dates. */
export function intentionFor(days: number | null, dates: string[], today: string): Intention {
  const t = dayNumber(today);
  const monday = t - ((new Date(t * DAY).getUTCDay() + 6) % 7);
  const set = new Set(dates);
  const week = Array.from({ length: 7 }, (_, i) => isoOf(monday + i)).map((date) => ({ date, prayed: set.has(date) }));
  const shown = week.filter((d) => d.prayed).length;
  return { days, week, shown, met: days !== null && shown >= days };
}

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Gentle rhythm: this month's prayer days, a welcome back after 7+ days away, and fresh-start days. */
export function rhythm(dates: string[], today: string) {
  const t = dayNumber(today);
  const before = dates.filter((d) => d < today);
  const last = before.length ? dayNumber(before[before.length - 1]!) : null;
  const weekday = new Date(t * DAY).getUTCDay();
  return {
    monthDays: dates.filter((d) => d.slice(0, 7) === today.slice(0, 7) && d <= today).length,
    welcomeBack: last !== null && t - last >= 7,
    freshStart: today.endsWith('-01') ? ('month' as const) : weekday === 1 ? ('week' as const) : null,
  };
}

/** Streaks from distinct prayer dates (YYYY-MM-DD, ascending) and today's date. */
export function streaks(dates: string[], today: string) {
  const days = dates.map(dayNumber);
  let longest = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const t = dayNumber(today);
  const set = new Set(days);
  let current = 0;
  for (let d = set.has(t) ? t : t - 1; set.has(d); d--) current++;
  return { currentStreak: current, longestStreak: longest };
}

export async function prayerStats(q: Queryable, userId: string, timeZone: string): Promise<PrayerStats> {
  const { rows: p } = await q.query<{ show_prayer_stats: boolean; weekly_intention: number | null }>('select show_prayer_stats, weekly_intention from public.profiles where id = $1', [userId]);
  const enabled = p[0]?.show_prayer_stats ?? true;
  const empty = { daysPrayed: 0, peoplePrayedFor: 0, requestsPrayedFor: 0, currentStreak: 0, longestStreak: 0, week: [], monthDays: 0, welcomeBack: false, freshStart: null, weeksPrayed: 0, weekRun: null };
  if (!enabled) return { enabled, ...empty };

  const { rows: days } = await q.query<{ day: string }>(
    `select distinct to_char(e.created_at at time zone $2, 'YYYY-MM-DD') as day
       from public.prayer_events e where e.user_id = $1 order by day`,
    [userId, timeZone],
  );
  const { rows: counts } = await q.query<{ people: number; requests: number; today: string }>(
    `select count(distinct po.user_id) filter (where po.user_id <> $1)::int as people,
            count(distinct e.post_id)::int as requests,
            to_char(now() at time zone $2, 'YYYY-MM-DD') as today
       from public.prayer_events e join public.posts po on po.id = e.post_id
      where e.user_id = $1`,
    [userId, timeZone],
  );
  const today = counts[0]!.today;
  const practice = await practiceSettings(q);
  const dates = days.map((d) => d.day);
  const set = new Set(dates);
  const t = dayNumber(today);
  return {
    enabled,
    daysPrayed: dates.length,
    peoplePrayedFor: counts[0]!.people,
    requestsPrayedFor: counts[0]!.requests,
    ...streaks(dates, today),
    ...rhythm(dates, today),
    ...weeksOfPrayer(dates, today),
    week: Array.from({ length: 7 }, (_, i) => isoOf(t - 6 + i)).map((date) => ({ date, prayed: set.has(date) })),
    ...(practice.weekly_intention_enabled ? { intention: intentionFor(p[0]?.weekly_intention ?? null, dates, today) } : {}),
    ...(practice.fresh_days_enabled ? { freshDay: await freshDay(q, userId, today) } : {}),
  };
}

/** Weekly intention: 1 to 6 days, or null to have none. */
export async function setIntention(q: Queryable, userId: string, days: number | null) {
  await q.query('update public.profiles set weekly_intention = $2 where id = $1', [userId, days]);
}
