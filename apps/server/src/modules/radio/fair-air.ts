// Fair air (docs/STATION_OPERATOR_GUIDE.md, "Fair air"), from two notebook pages.
// Both off by default.
//   Every request on the air (Notes p2: "a lack of tokens will NEVER stop a prayer
//   request from being seen & minimally broadcast"): every new prayer request
//   that may go on the radio is queued once, free (kind 'auto'). The station
//   sends these after the prayers members sent themselves (claimNext).
//   Daily cap (Donor Influence page: people paying to amplify prayers "on BOTH
//   SIDES" to flood the zone): at most radio_member_daily_cap radio sends per
//   member in 24 hours, an amplified send counting each time it goes out.
import type { Task } from 'graphile-worker';
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError } from '../../errors.js';
import { enqueue } from '../../jobs.js';

export async function settings(q: Queryable): Promise<{ everyRequest: boolean; dailyCap: number | null }> {
  const { rows } = await q.query<{ everyRequest: boolean; dailyCap: number | null }>(
    'select radio_every_request_enabled as "everyRequest", radio_member_daily_cap as "dailyCap" from public.token_settings',
  );
  return rows[0]!;
}

export const FairAirSettings = z.object({ everyRequest: z.boolean().optional(), dailyCap: z.number().int().min(1).max(1000).nullable().optional() });

export async function update(q: Queryable, patch: z.infer<typeof FairAirSettings>) {
  await q.query(
    `update public.token_settings set radio_every_request_enabled = coalesce($1, radio_every_request_enabled),
            radio_member_daily_cap = case when $2 then $3::int else radio_member_daily_cap end`,
    [patch.everyRequest ?? null, patch.dailyCap !== undefined, patch.dailyCap ?? null],
  );
  // Switching off drops automatic sends still waiting for the station.
  if (patch.everyRequest === false) await q.query(`delete from public.radio_prayers where kind = 'auto' and status = 'queued'`);
  return settings(q);
}

/** Refuse a radio send that would take the member past the daily cap. `repeats` is how many times this one goes out. */
export async function checkCap(q: Queryable, userId: string, repeats: number) {
  const { dailyCap } = await settings(q);
  if (dailyCap === null) return;
  const { rows } = await q.query<{ n: number }>(
    `select coalesce(sum(repeats), 0)::int as n from public.radio_prayers
      where user_id = $1 and kind = 'prayer' and status <> 'failed' and created_at > now() - interval '24 hours'`,
    [userId],
  );
  if (rows[0]!.n + repeats > dailyCap) {
    throw new AppError(409, 'radio_daily_cap', `You can send up to ${dailyCap} radio prayers a day (an amplified one counts each time it goes out). This keeps the air fair for everyone.`);
  }
}

/** Queue the automatic send for new requests that have none yet. Returns how many were queued. */
export async function queueNew(q: Queryable, limit = 50): Promise<number> {
  if (!(await settings(q)).everyRequest) return 0;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.radio_prayers (post_id, user_id, cost, idempotency_key, repeats, funded_by, kind)
     select p.id, p.user_id, 0, 'auto:' || p.id, 1, 'free', 'auto'
       from public.posts p join public.communities c on c.id = p.community_id
      where p.post_type = 'prayer_request' and p.created_at > now() - interval '24 hours'
        and p.moderation_status = 'visible' and not p.is_sensitive and not (p.is_lament and not p.lament_radio)
        and p.harm_category is null and p.state <> 'answered' and not ('radio' = any (c.hidden_features))
        and not exists (select 1 from public.radio_prayers r where r.post_id = p.id)
      order by p.id limit $1
     on conflict do nothing
     returning id`,
    [limit],
  );
  for (const r of rows) await enqueue(q, 'radio_transmit', { radioPrayerId: r.id }, { jobKey: `radio_transmit:${r.id}` });
  return rows.length;
}

export const everyRequestTask =
  (q: Queryable): Task =>
  async () => {
    await queueNew(q);
  };
