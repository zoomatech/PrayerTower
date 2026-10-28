// Preset times for scheduled token gifts, in the member's local time.
export interface WhenOption {
  key: string;
  label: string;
  at: () => Date;
}

/** The next given weekday (0 = Sunday) at hour:00, at least a minute away. */
export function nextWeekday(day: number, hour: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  if (d.getTime() <= from.getTime() + 60_000) d.setDate(d.getDate() + 7);
  return d;
}

export const WHEN_OPTIONS: WhenOption[] = [
  { key: 'fri', label: 'Friday 7 pm', at: () => nextWeekday(5, 19) },
  { key: 'sat', label: 'Saturday 9 am', at: () => nextWeekday(6, 9) },
  { key: 'sun', label: 'Sunday 9 am', at: () => nextWeekday(0, 9) },
];

/** Parse "2026-11-06 19:30" as local time; null if it isn't a valid future time. */
export function parseLocal(text: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) || d.getTime() <= Date.now() ? null : d;
}

export const REPEAT_OPTIONS = [
  { weeks: 1, label: 'Once' },
  { weeks: 4, label: 'Weekly for 4 weeks' },
  { weeks: 12, label: 'Weekly for 12 weeks' },
];
