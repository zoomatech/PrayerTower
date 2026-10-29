// Transmission windows (docs/STATION_OPERATOR_GUIDE.md, "Transmission windows"),
// off until an admin turns on radio_schedule_enabled. The station is handed
// prayers only inside a window and outside the quiet hours, in the schedule's
// time zone; outside them a claim gets nothing (204) and the prayers wait.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest } from '../../errors.js';

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const Window = z.object({
  /** 0 = Sunday ... 6 = Saturday: the day the window starts. */
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: HHMM,
  /** An end at or before the start runs past midnight into the next day. */
  end: HHMM,
});
export type Window = z.infer<typeof Window>;

export interface Schedule {
  enabled: boolean;
  timeZone: string;
  windows: Window[];
  quietStart: string | null;
  quietEnd: string | null;
}

export const SchedulePatch = z.object({
  enabled: z.boolean().optional(),
  timeZone: z.string().trim().min(1).max(60).optional(),
  windows: z.array(Window).max(20).optional(),
  quietStart: HHMM.nullable().optional(),
  quietEnd: HHMM.nullable().optional(),
});

export async function get(q: Queryable): Promise<Schedule> {
  const { rows } = await q.query<Schedule>(
    `select radio_schedule_enabled as enabled, radio_schedule_tz as "timeZone", radio_windows as windows,
            radio_quiet_start as "quietStart", radio_quiet_end as "quietEnd" from public.token_settings`,
  );
  return rows[0]!;
}

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export async function update(q: Queryable, patch: z.infer<typeof SchedulePatch>): Promise<Schedule> {
  if (patch.timeZone !== undefined && !validZone(patch.timeZone)) throw badRequest('Unknown time zone (use a name such as America/Chicago)');
  const quiet = patch.quietStart !== undefined || patch.quietEnd !== undefined;
  await q.query(
    `update public.token_settings set radio_schedule_enabled = coalesce($1, radio_schedule_enabled), radio_schedule_tz = coalesce($2, radio_schedule_tz),
            radio_windows = coalesce($3::jsonb, radio_windows),
            radio_quiet_start = case when $4 then $5 else radio_quiet_start end,
            radio_quiet_end = case when $4 then $6 else radio_quiet_end end`,
    [patch.enabled ?? null, patch.timeZone ?? null, patch.windows ? JSON.stringify(patch.windows) : null, quiet, patch.quietStart ?? null, patch.quietEnd ?? null],
  );
  return get(q);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Day of week (0 = Sunday) and minute of the day at `now` in timeZone. */
export function localTime(now: Date, timeZone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Whether minute m is in [start, end), where an end at or before the start wraps past midnight. */
const inSpan = (m: number, start: number, end: number) => (start < end ? m >= start && m < end : m >= start || m < end);

/** May the station transmit at `now`? Always while the schedule is off. */
export function onAir(s: Schedule, now = new Date()): boolean {
  if (!s.enabled) return true;
  const { day, minute } = localTime(now, s.timeZone);
  if (s.quietStart && s.quietEnd && s.quietStart !== s.quietEnd && inSpan(minute, minutes(s.quietStart), minutes(s.quietEnd))) return false;
  if (!s.windows.length) return true;
  return s.windows.some((w) => {
    const start = minutes(w.start);
    const end = minutes(w.end);
    if (start < end) return w.days.includes(day) && minute >= start && minute < end;
    // Past midnight: the evening part on its own days, the early part on the next day.
    return (w.days.includes(day) && minute >= start) || (w.days.includes((day + 6) % 7) && minute < end);
  });
}
