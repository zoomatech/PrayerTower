// My prayer list (Annotated Read, chat 1): people and topics a member keeps to pray for,
// with an optional daily or weekly reminder ("Did you remember to pray for Grandma
// today?"). Off by default. Private: only the member sees it, and "I prayed" is a private
// note that earns no tokens and counts toward no tier or board. A reminder is skipped
// when the member already prayed for that item since the last one.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';

export const MAX_ITEMS = 100;
const INTERVAL_MS = { daily: 86_400_000, weekly: 7 * 86_400_000 } as const;

export const NewItem = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(280).default(''),
  remind: z.enum(['off', 'daily', 'weekly']).default('off'),
  /** Hour of day (0–23, the member's time) for the reminder; with tzOffsetMinutes. */
  hour: z.number().int().min(0).max(23).default(9),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
});
export const EditItem = NewItem.partial();

interface ItemRow {
  id: string;
  name: string;
  note: string;
  remind: 'off' | 'daily' | 'weekly';
  next_reminder_at: Date | null;
  last_prayed_at: Date | null;
  prayed_count: number;
}

async function requireOn(q: Queryable) {
  const { rows } = await q.query<{ on: boolean }>('select prayer_list_enabled as on from public.notebook_settings');
  if (rows[0]?.on !== true) throw forbidden('The prayer list is off');
}

/** The next time the hour comes round (in the member's time), at least an hour from now. */
export function firstReminder(hour: number, tzOffsetMinutes: number, now = new Date()) {
  const local = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const at = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour) + tzOffsetMinutes * 60_000;
  return new Date(at > now.getTime() + 3_600_000 ? at : at + INTERVAL_MS.daily);
}

const present = (r: ItemRow) => ({
  id: r.id,
  name: r.name,
  note: r.note,
  remind: r.remind,
  nextReminderAt: r.next_reminder_at,
  lastPrayedAt: r.last_prayed_at,
  prayedCount: r.prayed_count,
});

export async function list(q: Queryable, userId: string) {
  const { rows: on } = await q.query<{ on: boolean }>('select prayer_list_enabled as on from public.notebook_settings');
  if (on[0]?.on !== true) return { enabled: false as const };
  const { rows } = await q.query<ItemRow>('select * from public.prayer_list_items where user_id = $1 order by created_at', [userId]);
  return { enabled: true as const, items: rows.map(present) };
}

export async function add(q: Queryable, userId: string, input: z.infer<typeof NewItem>) {
  await requireOn(q);
  const { rows: n } = await q.query<{ n: number }>('select count(*)::int as n from public.prayer_list_items where user_id = $1', [userId]);
  if (n[0]!.n >= MAX_ITEMS) throw badRequest(`Your list can hold ${MAX_ITEMS} names`);
  await q.query(
    'insert into public.prayer_list_items (user_id, name, note, remind, next_reminder_at) values ($1, $2, $3, $4, $5)',
    [userId, input.name, input.note, input.remind, input.remind === 'off' ? null : firstReminder(input.hour, input.tzOffsetMinutes)],
  );
  return list(q, userId);
}

export async function edit(q: Queryable, userId: string, id: string, input: z.infer<typeof EditItem>) {
  await requireOn(q);
  const remindChanged = input.remind !== undefined || input.hour !== undefined;
  const next = input.remind === 'off' ? null : remindChanged ? firstReminder(input.hour ?? 9, input.tzOffsetMinutes ?? 0) : undefined;
  const { rowCount } = await q.query(
    `update public.prayer_list_items set name = coalesce($3, name), note = coalesce($4, note), remind = coalesce($5, remind),
            next_reminder_at = case when $6 then $7::timestamptz else next_reminder_at end
      where id = $1 and user_id = $2`,
    [id, userId, input.name ?? null, input.note ?? null, input.remind ?? null, next !== undefined, next ?? null],
  );
  if (!rowCount) throw notFound('Prayer list item');
  return list(q, userId);
}

export async function remove(q: Queryable, userId: string, id: string) {
  const { rowCount } = await q.query('delete from public.prayer_list_items where id = $1 and user_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Prayer list item');
  return list(q, userId);
}

export async function prayed(q: Queryable, userId: string, id: string) {
  await requireOn(q);
  const { rowCount } = await q.query(
    'update public.prayer_list_items set last_prayed_at = now(), prayed_count = prayed_count + 1 where id = $1 and user_id = $2',
    [id, userId],
  );
  if (!rowCount) throw notFound('Prayer list item');
  return list(q, userId);
}

/** Cron (every 5 minutes): send due reminders while the list is switched on. */
export function sendDueRemindersTask(): Task {
  return async (_payload, helpers) => {
    await helpers.withPgClient(async (client) => {
      const { rows: on } = await client.query<{ on: boolean }>('select prayer_list_enabled as on from public.notebook_settings');
      if (on[0]?.on !== true) return;
      await client.query('begin');
      try {
        const { rows } = await client.query<ItemRow & { user_id: string }>(
          `select * from public.prayer_list_items where remind <> 'off' and next_reminder_at <= now()
            order by next_reminder_at limit 500 for update skip locked`,
        );
        for (const r of rows) {
          const every = INTERVAL_MS[r.remind as 'daily' | 'weekly'];
          // Already prayed for since the last reminder was due: no nudge this time.
          if (!r.last_prayed_at || r.last_prayed_at.getTime() < r.next_reminder_at!.getTime() - every) {
            await notifications.notify(client, r.user_id, {
              kind: 'prayer_list_reminder',
              title: 'Your prayer list',
              body: `Did you remember to pray for ${r.name} today?`,
              t: { key: 'prayer_list_reminder', params: { name: r.name } },
              data: { screen: 'prayer-list' },
              dedupeKey: `prayer_list:${r.id}:${r.next_reminder_at!.toISOString()}`,
            });
          }
          let next = r.next_reminder_at!.getTime() + every;
          while (next <= Date.now()) next += every;
          await client.query('update public.prayer_list_items set next_reminder_at = $2 where id = $1', [r.id, new Date(next)]);
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      }
    });
  };
}
