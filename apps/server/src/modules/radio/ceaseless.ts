// "Prayer without ceasing" (docs/STATION_OPERATOR_GUIDE.md, "Prayer without
// ceasing"), from the notebook's Digital Prayer Signal Codec page: prayer that
// keeps going out. Off until an admin turns on ceaseless_enabled. A member marks
// their own request "keep on the air". Whenever nothing else is waiting and the
// station has sent nothing for ceaseless_gap_minutes, one of those requests is
// queued again, free (kind 'ceaseless'), the one sent longest ago first. It goes
// out like any radio prayer: holds, windows, moderation and the content checks
// all apply, and a request that is removed, sensitive or answered drops out.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { enqueue } from '../../jobs.js';
import { requireFeature } from '../communities/index.js';
import * as operatorConsole from './console.js';

export async function settings(q: Queryable): Promise<{ enabled: boolean; gapMinutes: number }> {
  const { rows } = await q.query<{ enabled: boolean; gapMinutes: number }>(
    'select ceaseless_enabled as enabled, ceaseless_gap_minutes as "gapMinutes" from public.token_settings',
  );
  return rows[0]!;
}

export const CeaselessSettings = z.object({ enabled: z.boolean().optional(), gapMinutes: z.number().int().min(5).max(240).optional() });

export async function update(q: Queryable, patch: z.infer<typeof CeaselessSettings>) {
  await q.query(
    'update public.token_settings set ceaseless_enabled = coalesce($1, ceaseless_enabled), ceaseless_gap_minutes = coalesce($2, ceaseless_gap_minutes)',
    [patch.enabled ?? null, patch.gapMinutes ?? null],
  );
  // Switching off drops any re-send still waiting for the station.
  if (patch.enabled === false) await q.query(`delete from public.radio_prayers where kind = 'ceaseless' and status = 'queued'`);
  return settings(q);
}

/** Requests that may go out again: marked by their author, visible, not sensitive, not a lament kept off the air, not flagged, not answered. */
const ELIGIBLE = `p.keep_on_air and p.moderation_status = 'visible' and not p.is_sensitive and not (p.is_lament and not p.lament_radio)
  and p.harm_category is null and p.state <> 'answered'`;

/** The author keeps their request on the air, or takes it off. */
export async function setKeepOnAir(q: Queryable, userId: string, postId: string, on: boolean): Promise<{ keepOnAir: boolean }> {
  if (!(await settings(q)).enabled) throw badRequest('Keep on the air is switched off');
  await requireFeature(q, userId, 'radio');
  const { rows } = await q.query<{ is_sensitive: boolean; lament_off: boolean }>(
    'select is_sensitive, (is_lament and not lament_radio) as lament_off from public.posts where id = $1 and user_id = $2',
    [postId, userId],
  );
  const p = rows[0];
  if (!p) throw notFound('Post');
  if (on && p.is_sensitive) throw conflict("Sensitive requests aren't sent by radio.");
  if (on && p.lament_off) throw conflict('This is a lament kept off the radio. Allow radio for it first.');
  await q.query('update public.posts set keep_on_air = $3 where id = $1 and user_id = $2', [postId, userId, on]);
  return { keepOnAir: on };
}

/** Queue the next re-send when the air has been quiet long enough. Returns its id, or null. */
export async function queueDue(q: Queryable, now = new Date()): Promise<string | null> {
  const s = await settings(q);
  if (!s.enabled || !(await operatorConsole.mayTransmit(q, now))) return null;
  // Only when nothing else is waiting: members' own prayers always come first.
  const { rows: busy } = await q.query(`select 1 from public.radio_prayers where status in ('queued', 'sending') limit 1`);
  if (busy.length) return null;
  const { rows: last } = await q.query<{ at: Date | null }>(`select max(coalesce(transmitted_at, created_at)) as at from public.radio_prayers`);
  if (last[0]?.at && now.getTime() - last[0].at.getTime() < s.gapMinutes * 60_000) return null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, repeats, funded_by, kind, created_at)
     select p.id, p.user_id, 0, 'ceaseless:' || p.id || ':' || $2, 1, 'free', 'ceaseless', $1
       from public.posts p
      where ${ELIGIBLE}
      order by (select max(r.created_at) from public.radio_prayers r where r.post_id = p.id) asc nulls first, p.id
      limit 1
     returning id`,
    [now, now.getTime()],
  );
  const id = rows[0]?.id ?? null;
  if (id) await enqueue(q, 'radio_transmit', { radioPrayerId: id }, { jobKey: `radio_transmit:${id}` });
  return id;
}

/** For the operator console: how many requests are in the rotation. */
export async function summary(q: Queryable): Promise<{ enabled: boolean; gapMinutes: number; inRotation: number; sentLastDay: number } | null> {
  const s = await settings(q);
  if (!s.enabled) return null;
  const { rows } = await q.query<{ n: number; sent: number }>(
    `select (select count(*)::int from public.posts p where ${ELIGIBLE}) as n,
            (select count(*)::int from public.radio_prayers where kind = 'ceaseless' and status = 'transmitted' and transmitted_at > now() - interval '1 day') as sent`,
  );
  return { ...s, inRotation: rows[0]!.n, sentLastDay: rows[0]!.sent };
}

export const ceaselessTask =
  (q: Queryable): Task =>
  async () => {
    await queueDue(q);
  };
