// LIVE AMPLIFIER: licensed ham operators read radio prayers aloud on the air
// (migration 20261029003300_live_amplifier.sql). Off by default. Operators see
// only the request text, never a name, and only requests that a member chose to
// send by radio and that are visible, not sensitive and not waiting for review.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest, conflict, forbidden, notFound } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import * as tokens from '../tokens/index.js';

export interface AmplifierSettings {
  enabled: boolean;
  require_free: boolean;
  claim_minutes: number;
  max_open_claims: number;
  window_days: number;
  reads_per_prayer: number;
}

export async function settings(q: Queryable): Promise<AmplifierSettings> {
  const { rows } = await q.query<AmplifierSettings>(
    'select enabled, require_free, claim_minutes, max_open_claims, window_days, reads_per_prayer from public.live_amplifier_settings',
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  requireFree: z.boolean().optional(),
  claimMinutes: z.number().int().min(5).max(1440).optional(),
  maxOpenClaims: z.number().int().min(1).max(50).optional(),
  windowDays: z.number().int().min(1).max(365).optional(),
  readsPerPrayer: z.number().int().min(1).max(20).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.live_amplifier_settings set enabled = coalesce($1, enabled), require_free = coalesce($2, require_free),
            claim_minutes = coalesce($3, claim_minutes), max_open_claims = coalesce($4, max_open_claims),
            window_days = coalesce($5, window_days), reads_per_prayer = coalesce($6, reads_per_prayer)`,
    [p.enabled ?? null, p.requireFree ?? null, p.claimMinutes ?? null, p.maxOpenClaims ?? null, p.windowDays ?? null, p.readsPerPrayer ?? null],
  );
  return settings(q);
}

// Operators (admin) ------------------------------------------------------------------

/** US-style call signs and most others: prefix, one digit, suffix ending in a letter, optional /portable. */
export const CallSign = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,3}[0-9][A-Z0-9]{0,3}[A-Z](\/[A-Z0-9]{1,4})?$/, 'Not a call sign');

export const OperatorInput = z.object({ callSign: CallSign, licenseClass: z.string().trim().max(30).optional() });

/** An admin adds (or re-activates) an operator after checking the licence, e.g. in the FCC ULS. */
export async function setOperator(q: Queryable, adminId: string, userId: string, input: z.infer<typeof OperatorInput>) {
  const { rowCount } = await q.query('select 1 from public.profiles where id = $1', [userId]);
  if (!rowCount) throw notFound('Member');
  try {
    const { rows } = await q.query(
      `insert into public.live_amplifier_operators (user_id, call_sign, license_class, verified_by) values ($1, $2, $3, $4)
       on conflict (user_id) do update set call_sign = excluded.call_sign, license_class = excluded.license_class,
         active = true, verified_by = excluded.verified_by, verified_at = now()
       returning *`,
      [userId, input.callSign, input.licenseClass ?? null, adminId],
    );
    return rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('Another operator has that call sign');
    throw err;
  }
}

export async function deactivate(q: Queryable, userId: string) {
  const { rowCount } = await q.query('update public.live_amplifier_operators set active = false where user_id = $1', [userId]);
  if (!rowCount) throw notFound('Operator');
  await q.query(`update public.live_amplifier_readings set status = 'released' where operator_id = $1 and status = 'claimed'`, [userId]);
}

export async function operators(q: Queryable) {
  const { rows } = await q.query(
    `select o.user_id, p.display_name, o.call_sign, o.license_class, o.active, o.verified_at,
            (select count(*)::int from public.live_amplifier_readings r where r.operator_id = o.user_id and r.status = 'read') as readings
       from public.live_amplifier_operators o join public.profiles p on p.id = o.user_id
      order by o.active desc, o.call_sign`,
  );
  return rows;
}

// The operator's queue --------------------------------------------------------------

async function operatorOf(q: Queryable, userId: string) {
  const s = await settings(q);
  if (!s.enabled) throw forbidden('The Live Amplifier is not available');
  const { rows } = await q.query<{ call_sign: string }>('select call_sign from public.live_amplifier_operators where user_id = $1 and active', [userId]);
  if (!rows[0]) throw forbidden('Only licensed operators the team has added can read prayers on the air');
  if (s.require_free && (await tokens.settings(q)).radio_funding !== 'free') {
    throw conflict('Amateur rules: prayers are read on the air only while radio prayers are free (47 CFR 97.113).');
  }
  return { s, callSign: rows[0].call_sign };
}

/** Prayers this operator may read: visible, not sensitive, no review pending or crisis, read fewer times than allowed. */
const AVAILABLE = `
  from public.radio_prayers r join public.posts p on p.id = r.post_id
 where r.status <> 'failed' and r.created_at > now() - make_interval(days => $2)
   and p.moderation_status = 'visible' and not p.is_sensitive and not p.crisis
   and not exists (select 1 from public.moderation_items m where m.target_type = 'post' and m.target_id = p.id
                    and (m.status = 'pending' or m.source = 'crisis'))
   and not exists (select 1 from public.live_amplifier_readings x where x.radio_prayer_id = r.id and x.operator_id = $1 and x.status <> 'released')
   and (select count(*) from public.live_amplifier_readings x where x.radio_prayer_id = r.id and x.status <> 'released'
          and (x.status = 'read' or x.claimed_at > now() - make_interval(mins => $3))) < $4`;

export async function queue(q: Queryable, userId: string, limit = 20) {
  const { s } = await operatorOf(q, userId);
  const { rows } = await q.query<{ id: string; text: string; created_at: Date }>(
    `select r.id, left(regexp_replace(p.body, '\\s+', ' ', 'g'), 1000) as text, r.created_at ${AVAILABLE}
      order by r.id limit $5`,
    [userId, s.window_days, s.claim_minutes, s.reads_per_prayer, limit],
  );
  return rows;
}

export interface Reading {
  id: string;
  radio_prayer_id: string;
  text: string;
  status: 'claimed' | 'read' | 'released';
  claimed_at: Date;
  read_at: Date | null;
}

export async function mine(q: Queryable, userId: string): Promise<Reading[]> {
  const { rows } = await q.query<Reading>(
    `select x.id, x.radio_prayer_id, left(regexp_replace(p.body, '\\s+', ' ', 'g'), 1000) as text, x.status, x.claimed_at, x.read_at
       from public.live_amplifier_readings x join public.radio_prayers r on r.id = x.radio_prayer_id join public.posts p on p.id = r.post_id
      where x.operator_id = $1 and x.status <> 'released' order by x.id desc limit 50`,
    [userId],
  );
  return rows;
}

/** Claim a prayer to read. Expired claims of this operator are let go first. */
export async function claim(q: Queryable, userId: string, radioPrayerId: string) {
  const { s, callSign } = await operatorOf(q, userId);
  await q.query(
    `update public.live_amplifier_readings set status = 'released'
      where operator_id = $1 and status = 'claimed' and claimed_at < now() - make_interval(mins => $2)`,
    [userId, s.claim_minutes],
  );
  const { rows: open } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.live_amplifier_readings where operator_id = $1 and status = 'claimed'`,
    [userId],
  );
  if (open[0]!.n >= s.max_open_claims) throw conflict(`Read or let go of a prayer first (at most ${s.max_open_claims} at a time)`);
  // Lock the radio prayer so two operators can't both take the last read.
  await q.query('select 1 from public.radio_prayers where id = $1 for update', [radioPrayerId]);
  const { rowCount } = await q.query(`select 1 ${AVAILABLE} and r.id = $5`, [userId, s.window_days, s.claim_minutes, s.reads_per_prayer, radioPrayerId]);
  if (!rowCount) throw conflict('That prayer is no longer in the queue');
  const { rows } = await q.query<{ id: string }>(
    `insert into public.live_amplifier_readings (radio_prayer_id, operator_id, call_sign) values ($1, $2, $3)
     on conflict (radio_prayer_id, operator_id) do update set status = 'claimed', claimed_at = now(), call_sign = excluded.call_sign, read_at = null
       where live_amplifier_readings.status = 'released'
     returning id`,
    [radioPrayerId, userId, callSign],
  );
  if (!rows[0]) throw conflict('You already have this prayer');
  return (await mine(q, userId)).find((r) => r.id === rows[0]!.id)!;
}

async function openReading(q: Queryable, userId: string, id: string) {
  const { rows } = await q.query<{ status: string; radio_prayer_id: string }>(
    'select status, radio_prayer_id from public.live_amplifier_readings where id = $1 and operator_id = $2 for update',
    [id, userId],
  );
  if (!rows[0]) throw notFound('Reading');
  if (rows[0].status !== 'claimed') throw conflict(`This reading is already ${rows[0].status}`);
  return rows[0];
}

export const ReadInput = z.object({ onAirNote: z.string().trim().max(100).optional() });

/** The operator read it on the air. The person who posted it is told (no names, no reach claims). */
export async function markRead(q: Queryable, userId: string, id: string, input: z.infer<typeof ReadInput>) {
  await operatorOf(q, userId);
  const r = await openReading(q, userId, id);
  // Re-check: the request may have been removed or flagged since it was claimed.
  const { rows: p } = await q.query<{ ok: boolean; poster_id: string; post_id: string }>(
    `select p.moderation_status = 'visible' and not p.is_sensitive as ok, p.user_id as poster_id, p.id as post_id
       from public.radio_prayers r join public.posts p on p.id = r.post_id where r.id = $1`,
    [r.radio_prayer_id],
  );
  if (!p[0]?.ok) {
    await q.query(`update public.live_amplifier_readings set status = 'released' where id = $1`, [id]);
    throw badRequest('This request was removed or hidden. Please do not read it.');
  }
  await q.query(`update public.live_amplifier_readings set status = 'read', read_at = now(), on_air_note = $2 where id = $1`, [id, input.onAirNote ?? null]);
  await notifications.notify(q, p[0].poster_id, {
    kind: 'live_amplifier_read',
    title: 'Your request was read aloud on the air',
    body: 'A licensed ham radio operator read your prayer request aloud so more people could pray with you.',
    t: { key: 'live_amplifier_read' },
    data: { postId: p[0].post_id },
    dedupeKey: `live_amplifier_read:${id}`,
  });
}

export async function release(q: Queryable, userId: string, id: string) {
  await openReading(q, userId, id);
  await q.query(`update public.live_amplifier_readings set status = 'released' where id = $1`, [id]);
}

/** Admin view: recent readings by call sign. */
export async function recentReadings(q: Queryable, limit = 100) {
  const { rows } = await q.query(
    `select x.id, x.radio_prayer_id, x.call_sign, x.status, x.on_air_note, x.claimed_at, x.read_at
       from public.live_amplifier_readings x order by x.id desc limit $1`,
    [limit],
  );
  return rows;
}
