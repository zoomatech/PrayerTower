// Gentle reminders (migration 20261029073000_gentle_reminders.sql), two switches
// in Admin → Gentle reminders, both off:
// - A daily reminder at the member's own time and days. Skipped on a day they
//   already prayed; never says what was missed; after `quiet_after` reminders in
//   a row went by with no prayer it drops to once a week, and goes back to the
//   member's days as soon as they pray.
// - Weeks of prayer in place of "days in a row" (see weeksOfPrayer).
// Open Circle members get the same reminders without religious words.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export interface ReminderSettings {
  daily_reminder_enabled: boolean;
  gentle_streak_enabled: boolean;
  quiet_after: number;
}

export async function settings(q: Queryable): Promise<ReminderSettings> {
  const { rows } = await q.query<ReminderSettings>('select daily_reminder_enabled, gentle_streak_enabled, quiet_after from public.reminder_settings');
  return rows[0] ?? { daily_reminder_enabled: false, gentle_streak_enabled: false, quiet_after: 7 };
}

export const SettingsPatch = z.object({
  dailyReminderEnabled: z.boolean().optional(),
  gentleStreakEnabled: z.boolean().optional(),
  quietAfter: z.number().int().min(3).max(60).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.reminder_settings set daily_reminder_enabled = coalesce($1, daily_reminder_enabled),
            gentle_streak_enabled = coalesce($2, gentle_streak_enabled), quiet_after = coalesce($3, quiet_after)`,
    [p.dailyReminderEnabled ?? null, p.gentleStreakEnabled ?? null, p.quietAfter ?? null],
  );
  return settings(q);
}

export async function features(q: Queryable) {
  const s = await settings(q);
  return { dailyReminder: s.daily_reminder_enabled, gentleStreak: s.gentle_streak_enabled };
}

// ----- Time zones -----

/** The wall-clock parts of `at` in `timeZone`. */
function wall(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')),
    min: Number(get('minute')),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  };
}

/** The instant when it is y-m-d hh:mm in `timeZone` (DST-safe to the minute). */
export function zonedTime(y: number, m: number, d: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(y, m - 1, d, hour, minute);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const w = wall(new Date(guess), timeZone);
    guess += target - Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);
  }
  return new Date(guess);
}

/** The first chosen day and time after `after`, in the member's time zone. */
export function nextAt(hour: number, minute: number, days: number[], timeZone: string, after: Date): Date {
  const today = wall(after, timeZone);
  for (let i = 0; i <= 8; i++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    if (!days.includes(base.getUTCDay())) continue;
    const at = zonedTime(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, minute, timeZone);
    if (at > after) return at;
  }
  throw new Error('no reminder day chosen');
}

export const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// ----- The member's reminder -----

export const Choice = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  timeZone: z.string().min(1).max(64),
});

interface Row {
  user_id: string;
  hour: number;
  minute: number;
  days: number[];
  time_zone: string;
  next_at: Date;
  last_sent_at: Date | null;
  unanswered: number;
}

const present = (r: Row | undefined) =>
  r ? { hour: r.hour, minute: r.minute, days: [...r.days].sort(), timeZone: r.time_zone, nextAt: r.next_at } : null;

export async function mine(q: Queryable, userId: string) {
  if (!(await settings(q)).daily_reminder_enabled) return { enabled: false as const };
  const { rows } = await q.query<Row>('select * from public.daily_reminders where user_id = $1', [userId]);
  return { enabled: true as const, reminder: present(rows[0]) };
}

/** Set the member's reminder, or turn it off with null. */
export async function setMine(q: Queryable, userId: string, choice: z.infer<typeof Choice> | null) {
  if (!(await settings(q)).daily_reminder_enabled) throw forbidden('Daily reminders are off');
  if (!choice) {
    await q.query('delete from public.daily_reminders where user_id = $1', [userId]);
    return mine(q, userId);
  }
  if (!validZone(choice.timeZone)) throw badRequest('Unknown time zone');
  const days = [...new Set(choice.days)];
  const next = nextAt(choice.hour, choice.minute, days, choice.timeZone, new Date());
  await q.query(
    `insert into public.daily_reminders (user_id, hour, minute, days, time_zone, next_at) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update set hour = excluded.hour, minute = excluded.minute, days = excluded.days,
       time_zone = excluded.time_zone, next_at = excluded.next_at, unanswered = 0`,
    [userId, choice.hour, choice.minute, days, choice.timeZone, next],
  );
  return mine(q, userId);
}

// Kind, unhurried lines; none mention a missed day, a count or a streak.
const LINES = [
  { title: 'A quiet moment to pray', body: "Whenever you're ready, someone here would be glad of a prayer." },
  { title: 'Time to pray, if you like', body: "Take a breath. There's a request here you could lift up." },
  { title: 'A moment with God', body: 'No rush. A short prayer for someone counts for a lot.' },
] as const;

/** Cron (every 5 minutes): send the reminders that are due, while switched on. */
export function dueTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      const s = await settings(client);
      if (!s.daily_reminder_enabled) return;
      await client.query('begin');
      try {
        const { rows } = await client.query<Row & { prayed_today: boolean; prayed_since: boolean; local_day: string }>(
          `select r.*,
                  exists (select 1 from public.prayer_events e where e.user_id = r.user_id
                           and (e.created_at at time zone r.time_zone)::date = (now() at time zone r.time_zone)::date) as prayed_today,
                  r.last_sent_at is not null and exists (select 1 from public.prayer_events e where e.user_id = r.user_id and e.created_at > r.last_sent_at) as prayed_since,
                  to_char(now() at time zone r.time_zone, 'YYYY-MM-DD') as local_day
             from public.daily_reminders r
            where r.next_at <= now()
            order by r.next_at limit 500 for update of r skip locked`,
        );
        for (const r of rows) {
          // Did the last reminder lead to a prayer? Only used to slow down, never shown.
          const unanswered = r.prayed_since || r.prayed_today ? 0 : r.last_sent_at ? r.unanswered + 1 : 0;
          // Gone quiet for a while: once a week until they pray again.
          const resting = unanswered >= s.quiet_after && r.last_sent_at !== null && Date.now() - r.last_sent_at.getTime() < 6.5 * 86_400_000;
          let sent = false;
          if (!r.prayed_today && !resting) {
            const n = Number(r.local_day.replaceAll('-', '')) % LINES.length;
            await notifications.notify(client, r.user_id, {
              kind: 'daily_reminder',
              ...LINES[n]!,
              t: { key: `daily_reminder_${n}` },
              data: { screen: 'feed' },
              dedupeKey: `daily_reminder:${r.local_day}`,
            });
            sent = true;
          }
          await client.query(
            `update public.daily_reminders set next_at = $2, unanswered = $3, last_sent_at = case when $4 then now() else last_sent_at end where user_id = $1`,
            [r.user_id, nextAt(r.hour, r.minute, r.days, r.time_zone, new Date()), r.prayed_today ? 0 : unanswered, sent],
          );
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    });
  };
}

// ----- Weeks of prayer -----

/** Monday of the week holding this YYYY-MM-DD, as a day number. */
const weekOf = (iso: string) => {
  const day = Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
  const weekday = (new Date(day * 86_400_000).getUTCDay() + 6) % 7;
  return (day - weekday) / 7;
};

/**
 * Weeks with at least one prayer (a total that only grows) and the run of weeks
 * up to this one (or last, if none yet this week) where at most one rest week
 * sits between prayed weeks. The run is null under 2, so a broken run is never
 * shown: the total stays.
 */
export function weeksOfPrayer(dates: string[], today: string) {
  const weeks = new Set(dates.map(weekOf));
  const now = weekOf(today);
  let run = 0;
  let w = weeks.has(now) ? now : weeks.has(now - 1) ? now - 1 : null;
  while (w !== null) {
    run++;
    w = weeks.has(w - 1) ? w - 1 : weeks.has(w - 2) ? w - 2 : null;
  }
  return { weeksPrayed: weeks.size, weekRun: run >= 2 ? run : null };
}
