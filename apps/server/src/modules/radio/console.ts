// Operator console (docs/STATION_OPERATOR_GUIDE.md, "Operator console"): one
// screen for the station's control operator: what is waiting, whether the
// station may transmit now, when each station last identified, the latest log,
// and two manual overrides (hold everything; send outside the windows for a
// while). Off until an admin turns on operator_console_enabled. Admins and
// members with the radio_operator role may use it.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as beacon from './beacon.js';
import * as ceaseless from './ceaseless.js';
import * as nodes from './nodes.js';
import * as oplog from './oplog.js';
import * as schedule from './schedule.js';
import * as sky from './sky.js';

export interface ConsoleSettings {
  enabled: boolean;
  paused: boolean;
  windowOverrideUntil: Date | null;
}

export async function settings(q: Queryable): Promise<ConsoleSettings> {
  const { rows } = await q.query<ConsoleSettings>(
    `select operator_console_enabled as enabled, radio_paused as paused, radio_window_override_until as "windowOverrideUntil" from public.token_settings`,
  );
  return rows[0]!;
}

/** Turning the console off also lifts its overrides, so nothing stays held by a screen nobody can see. */
export async function setEnabled(q: Queryable, on: boolean) {
  await q.query(
    `update public.token_settings set operator_console_enabled = $1,
            radio_paused = radio_paused and $1, radio_window_override_until = case when $1 then radio_window_override_until end`,
    [on],
  );
}

export const Override = z.object({
  /** Hold every transmission (true) or let them go again (false). */
  paused: z.boolean().optional(),
  /** Send outside the windows and quiet hours for this many minutes from now; 0 ends it. */
  windowOverrideMinutes: z.number().int().min(0).max(240).optional(),
});

export async function override(q: Queryable, o: z.infer<typeof Override>, now = new Date()) {
  const until = o.windowOverrideMinutes === undefined ? undefined : o.windowOverrideMinutes ? new Date(now.getTime() + o.windowOverrideMinutes * 60_000) : null;
  await q.query(
    `update public.token_settings set radio_paused = coalesce($1, radio_paused),
            radio_window_override_until = case when $2 then $3::timestamptz else radio_window_override_until end
      where operator_console_enabled`,
    [o.paused ?? null, until !== undefined, until ?? null],
  );
}

/** May the station be handed prayers now? Not while held or the dish target is down; outside the windows only while the override lasts. */
export async function mayTransmit(q: Queryable, now = new Date()): Promise<boolean> {
  const s = await settings(q);
  if (s.paused) return false;
  // The dish target below its minimum elevation (sky.ts), when that hold is on: the override does not lift it.
  if (!(await sky.allowsTransmit(q, now))) return false;
  if (s.windowOverrideUntil && s.windowOverrideUntil > now) return true;
  return schedule.onAir(await schedule.get(q), now);
}

/** A station's "station_id" check (station status.ts): when it last identified and how often it must. */
function parseId(detail: string): { lastIdAt: string | null; everyMinutes: number | null } {
  const last = /last=(\S+)/.exec(detail)?.[1];
  const every = Number(/every=(\d+)/.exec(detail)?.[1]);
  return { lastIdAt: last && last !== 'never' && !Number.isNaN(Date.parse(last)) ? new Date(last).toISOString() : null, everyMinutes: every > 0 ? every : null };
}

/** Everything on the console. Null while the switch is off. */
export async function view(q: Queryable, now = new Date()) {
  const s = await settings(q);
  if (!s.enabled) return null;
  const sched = await schedule.get(q);
  const { rows: counts } = await q.query<{ queued: number; sending: number; oldest: Date | null }>(
    `select count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'sending')::int as sending,
            min(created_at) filter (where status = 'queued') as oldest
       from public.radio_prayers where status in ('queued', 'sending')`,
  );
  const { rows: next } = await q.query<{ id: string; text: string; urgency: number; created_at: Date; repeats: number }>(
    `select r.id, left(p.body, 140) as text, p.urgency, r.created_at, r.repeats
       from public.radio_prayers r join public.posts p on p.id = r.post_id
      where r.status = 'queued' order by r.id limit 10`,
  );
  const { rows: stations } = await q.query<{ call_sign: string; reported_at: Date; checks: { name: string; ok: boolean; detail: string }[] }>(
    'select call_sign, reported_at, checks from public.station_status order by call_sign',
  );
  const log = (await oplog.rows(q, new Date(now.getTime() - 24 * 3_600_000), now)).slice(-20).reverse();
  const c = counts[0]!;
  const b = await beacon.settings(q);
  return {
    paused: s.paused,
    windowOverrideUntil: s.windowOverrideUntil && s.windowOverrideUntil > now ? s.windowOverrideUntil.toISOString() : null,
    onAirNow: await mayTransmit(q, now),
    schedule: { enabled: sched.enabled, timeZone: sched.timeZone, inWindow: schedule.onAir(sched, now), windows: sched.windows, quietStart: sched.quietStart, quietEnd: sched.quietEnd },
    queue: {
      queued: c.queued,
      sending: c.sending,
      oldestMinutes: c.oldest ? Math.round((now.getTime() - c.oldest.getTime()) / 60_000) : null,
      next: next.map((r) => ({ id: r.id, text: r.text, urgency: r.urgency, repeats: r.repeats, waitingMinutes: Math.round((now.getTime() - r.created_at.getTime()) / 60_000) })),
    },
    stations: stations.map((st) => {
      const id = parseId(st.checks.find((ch) => ch.name === 'station_id')?.detail ?? '');
      const nextIdAt = id.lastIdAt && id.everyMinutes ? new Date(Date.parse(id.lastIdAt) + id.everyMinutes * 60_000).toISOString() : null;
      return { callSign: st.call_sign, lastHeartbeat: st.reported_at.toISOString(), ...id, nextIdAt };
    }),
    relays: await nodes.relays(q, now),
    sky: await sky.now(q, now),
    ceaseless: await ceaseless.summary(q),
    beacon: { enabled: b.enabled, minutes: b.minutes, recent: b.enabled ? await beacon.recent(q, now) : [] },
    log: log.map((r) => ({ at: r.time_utc, callSign: r.call_sign, station: r.station, preset: r.preset, status: r.status, heard: r.heard, error: r.error, text: r.contents.slice(0, 140) })),
  };
}
