// Activity signals: prayer taps that look automated (notebook Page 14,
// "handling AI agents?"). Flags go to moderators; nothing is penalized
// automatically, and a moderator can clear a flag or confirm it.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';

export interface ActivitySettings {
  signals_enabled: boolean;
  max_prayers_per_hour: number;
  regular_min_events: number;
  regular_max_stddev_seconds: number;
}

export async function settings(q: Queryable): Promise<ActivitySettings> {
  const { rows } = await q.query<ActivitySettings>(
    `select signals_enabled, max_prayers_per_hour, regular_min_events, regular_max_stddev_seconds::float8 as regular_max_stddev_seconds
       from public.activity_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  signalsEnabled: z.boolean().optional(),
  maxPrayersPerHour: z.number().int().min(5).max(10_000).optional(),
  regularMinEvents: z.number().int().min(5).max(10_000).optional(),
  regularMaxStddevSeconds: z.number().min(0).max(600).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.activity_settings set signals_enabled = coalesce($1, signals_enabled),
       max_prayers_per_hour = coalesce($2, max_prayers_per_hour), regular_min_events = coalesce($3, regular_min_events),
       regular_max_stddev_seconds = coalesce($4, regular_max_stddev_seconds)`,
    [p.signalsEnabled ?? null, p.maxPrayersPerHour ?? null, p.regularMinEvents ?? null, p.regularMaxStddevSeconds ?? null],
  );
  return settings(q);
}

/** Look at the last hour of prayer taps and flag members whose pattern no person would make. */
export async function scan(q: Queryable, now = new Date()): Promise<number> {
  const s = await settings(q);
  if (!s.signals_enabled) return 0;
  const { rows } = await q.query<{ user_id: string; taps: number; gap_stddev: number | null; gap_avg: number | null }>(
    `with taps as (
       select user_id, created_at,
              extract(epoch from created_at - lag(created_at) over (partition by user_id order by created_at)) as gap
         from public.prayer_events
        where created_at > $1::timestamptz - interval '1 hour' and created_at <= $1)
     select user_id, count(*)::int as taps, stddev_samp(gap)::float8 as gap_stddev, avg(gap)::float8 as gap_avg
       from taps group by user_id having count(*) >= least($2::int, $3::int)`,
    [now, s.max_prayers_per_hour, s.regular_min_events],
  );
  let flagged = 0;
  for (const r of rows) {
    const reasons: string[] = [];
    if (r.taps > s.max_prayers_per_hour) reasons.push('too_many');
    if (r.taps >= s.regular_min_events && r.gap_stddev !== null && r.gap_stddev <= s.regular_max_stddev_seconds) reasons.push('too_regular');
    for (const reason of reasons) {
      const { rowCount } = await q.query(
        `insert into public.activity_flags (user_id, reason, details) values ($1, $2, $3)
         on conflict (user_id, reason) where status = 'pending' do nothing`,
        [r.user_id, reason, { taps: r.taps, gapStddevSeconds: r.gap_stddev, gapAvgSeconds: r.gap_avg }],
      );
      flagged += rowCount ?? 0;
    }
  }
  return flagged;
}

export function scanTask(q: Queryable): Task {
  return async () => {
    await scan(q);
  };
}

export async function pending(q: Queryable) {
  const { rows } = await q.query(
    `select f.id, f.user_id, coalesce(nullif(p.display_name, ''), 'Member') as name, f.reason, f.details, f.created_at
       from public.activity_flags f join public.profiles p on p.id = f.user_id
      where f.status = 'pending' order by f.id limit 100`,
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, reason: r.reason, details: r.details, createdAt: r.created_at }));
}

export const Decision = z.object({ status: z.enum(['cleared', 'confirmed']), note: z.string().trim().max(1000).optional() });

export async function decide(q: Queryable, moderatorId: string, id: string, d: z.infer<typeof Decision>) {
  const { rows } = await q.query<{ status: string }>('select status from public.activity_flags where id = $1', [id]);
  if (!rows[0]) throw notFound('Flag');
  if (rows[0].status !== 'pending') throw conflict('This flag was already decided');
  await q.query(`update public.activity_flags set status = $2, note = $3, decided_by = $4, decided_at = now() where id = $1`, [
    id,
    d.status,
    d.note ?? null,
    moderatorId,
  ]);
}
