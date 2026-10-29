// Fresh starts on days that matter (docs/GROWTH_PRACTICES.md), off. People are likelier to start
// a new habit on a "temporal landmark", a day that feels like a new beginning (Dai, Milkman &
// Riis 2014). Gentle rhythm already marks Mondays and the 1st; this adds up to three dates of the
// member's own, and in communities with faith wording the first day of Advent, Ash Wednesday and
// Easter. The invitation shows only on the day, on Me, and is never pushed.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, notFound } from '../../errors.js';
import { settings } from '../practices/index.js';

export const MAX_DAYS = 3;

export type Season = 'advent' | 'lent' | 'easter';
export type FreshDay = { label: string } | { season: Season };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Easter Sunday (Gregorian), by the anonymous algorithm. */
export function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/** The season a date (YYYY-MM-DD) begins, if any: Advent Sunday, Ash Wednesday or Easter. */
export function seasonOn(today: string): Season | null {
  const year = Number(today.slice(0, 4));
  const e = easter(year);
  if (iso(e) === today) return 'easter';
  if (iso(new Date(e.getTime() - 46 * DAY)) === today) return 'lent';
  const christmas = new Date(Date.UTC(year, 11, 25));
  const w = christmas.getUTCDay();
  if (iso(new Date(christmas.getTime() - (w === 0 ? 28 : w + 21) * DAY)) === today) return 'advent';
  return null;
}

export const NewDay = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  label: z.string().trim().min(1).max(40),
});

async function requireOn(q: Queryable) {
  if (!(await settings(q)).fresh_days_enabled) throw badRequest('Fresh-start days are off');
}

export async function list(q: Queryable, userId: string) {
  const { rows } = await q.query<{ id: string; month: number; day: number; label: string }>(
    'select id, month, day, label from public.fresh_start_days where user_id = $1 order by month, day',
    [userId],
  );
  return rows;
}

export async function add(q: Queryable, userId: string, input: z.infer<typeof NewDay>) {
  await requireOn(q);
  // 29 February is fine; 31 April is not a day.
  if (new Date(Date.UTC(2024, input.month - 1, input.day)).getUTCMonth() !== input.month - 1) throw badRequest('That date does not exist');
  if ((await list(q, userId)).length >= MAX_DAYS) throw badRequest(`Up to ${MAX_DAYS} days`);
  await q.query('insert into public.fresh_start_days (user_id, month, day, label) values ($1, $2, $3, $4)', [userId, input.month, input.day, input.label]);
  return list(q, userId);
}

export async function remove(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query('delete from public.fresh_start_days where id = $1 and user_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Day');
  return list(q, userId);
}

/** Today's fresh start for the member, or null. Their own day first; seasons only with faith wording. */
export async function freshDay(q: Queryable, userId: string, today: string): Promise<FreshDay | null> {
  const month = Number(today.slice(5, 7));
  const day = Number(today.slice(8, 10));
  const { rows } = await q.query<{ label: string }>('select label from public.fresh_start_days where user_id = $1 and month = $2 and day = $3 limit 1', [userId, month, day]);
  if (rows[0]) return { label: rows[0].label };
  const season = seasonOn(today);
  if (!season) return null;
  const { rows: w } = await q.query<{ neutral: boolean }>(
    `select coalesce(c.vocabulary ->> 'wording', case when c.tradition = 'secular' then 'neutral' else 'faith' end) = 'neutral' as neutral
       from public.communities c where c.id = public.member_community_id($1)`,
    [userId],
  );
  return w[0]?.neutral ? null : { season };
}
