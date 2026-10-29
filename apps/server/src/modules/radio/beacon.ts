// Reception beacon (docs/STATION_OPERATOR_GUIDE.md, "Reception beacon"): every
// radio_beacon_minutes the station sends one short identified test burst
// ("Station test <code>", the setup wizard's own test, setup.ts), and every
// listener node or listening page that decodes it is recorded with its signal
// (radio_beacon_heard). The operator console shows the last day of them, so
// the operator sees how reception changes through the day. No beacon goes out
// while the console's hold is on or outside the transmission windows. Off until
// an admin turns on radio_beacon_enabled.
import { randomBytes } from 'node:crypto';
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import * as operatorConsole from './console.js';

export async function settings(q: Queryable): Promise<{ enabled: boolean; minutes: number }> {
  const { rows } = await q.query<{ enabled: boolean; minutes: number }>(
    'select radio_beacon_enabled as enabled, radio_beacon_minutes as minutes from public.token_settings',
  );
  return rows[0]!;
}

export const BeaconSettings = z.object({ enabled: z.boolean().optional(), minutes: z.number().int().min(15).max(360).optional() });

export async function update(q: Queryable, patch: z.infer<typeof BeaconSettings>) {
  await q.query(
    'update public.token_settings set radio_beacon_enabled = coalesce($1, radio_beacon_enabled), radio_beacon_minutes = coalesce($2, radio_beacon_minutes)',
    [patch.enabled ?? null, patch.minutes ?? null],
  );
  // Switching off drops a beacon still waiting for the station.
  if (patch.enabled === false) await q.query(`delete from public.radio_setup_tests where beacon and status = 'requested'`);
  return settings(q);
}

/** Queue the next beacon when one is due. Returns its id, or null when none is due (or it is off). */
export async function queueDue(q: Queryable, now = new Date()): Promise<string | null> {
  const s = await settings(q);
  if (!s.enabled || !(await operatorConsole.mayTransmit(q, now))) return null;
  const { rows: last } = await q.query<{ created_at: Date }>(
    `select created_at from public.radio_setup_tests where beacon order by created_at desc limit 1`,
  );
  if (last[0] && now.getTime() - last[0].created_at.getTime() < s.minutes * 60_000) return null;
  // Never alongside a test that is already waiting (a wizard test, or a beacon not yet picked up).
  const { rows: open } = await q.query(`select 1 from public.radio_setup_tests where status in ('requested', 'sending')`);
  if (open.length) return null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.radio_setup_tests (kind, code, beacon, created_at) values ('burst', $1, true, $2) returning id`,
    [randomBytes(3).toString('hex').toUpperCase(), now],
  );
  return rows[0]!.id;
}

export interface BeaconRow {
  id: string;
  sentAt: string | null;
  status: string;
  callSign: string | null;
  preset: string | null;
  heard: { by: string; snrDb: number; peakDbfs: number | null }[];
}

/** The last day's beacons, newest first, each with every receiver that heard it. */
export async function recent(q: Queryable, now = new Date()): Promise<BeaconRow[]> {
  const { rows } = await q.query<{ id: string; sent_at: Date | null; status: string; call_sign: string | null; preset: string | null; heard: { by: string; snrDb: number; peakDbfs: number | null }[] }>(
    `select t.id, t.sent_at, t.status, t.call_sign, t.preset,
            coalesce(json_agg(json_build_object('by', h.heard_by, 'snrDb', h.snr_db, 'peakDbfs', h.peak_dbfs) order by h.snr_db desc)
                     filter (where h.test_id is not null), '[]') as heard
       from public.radio_setup_tests t left join public.radio_beacon_heard h on h.test_id = t.id
      where t.beacon and t.created_at > $1
      group by t.id order by t.created_at desc limit 48`,
    [new Date(now.getTime() - 24 * 3_600_000)],
  );
  return rows.map((r) => ({ id: r.id, sentAt: r.sent_at?.toISOString() ?? null, status: r.status, callSign: r.call_sign, preset: r.preset, heard: r.heard }));
}

export const beaconTask =
  (q: Queryable): Task =>
  async () => {
    await queueDue(q);
  };
