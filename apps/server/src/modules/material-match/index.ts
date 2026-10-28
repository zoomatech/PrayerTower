// Equal material help for paid radio prayers (migration 20261029005000_material_match.sql;
// docs/MATERIAL_MATCH.md). Off by default. While on, each radio prayer paid with
// Priestly tokens records material help of equal value owed to the afflicted;
// admins mark it sent by recording a "help sent" entry in the Common Prayer Fund.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { badRequest } from '../../errors.js';
import * as commonFund from '../common-fund/index.js';

export interface MatchSettings {
  enabled: boolean;
  centsPerToken: number;
}

export async function settings(q: Queryable): Promise<MatchSettings> {
  const { rows } = await q.query<MatchSettings>('select enabled, cents_per_token as "centsPerToken" from public.material_match_settings');
  return rows[0]!;
}

export const SettingsPatch = z.object({ enabled: z.boolean().optional(), centsPerToken: z.number().int().min(1).max(100_000).optional() });

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query('update public.material_match_settings set enabled = coalesce($1, enabled), cents_per_token = coalesce($2, cents_per_token)', [
    p.enabled ?? null,
    p.centsPerToken ?? null,
  ]);
  return settings(q);
}

/** Called when a radio prayer is paid for: records the equal material help owed. */
export async function onRadioSpend(q: Queryable, radioPrayerId: string, userId: string, tokens: number) {
  if (tokens <= 0) return;
  const s = await settings(q);
  if (!s.enabled) return;
  await q.query(
    `insert into public.material_help_matches (radio_prayer_id, user_id, tokens, cents) values ($1, $2, $3, $4) on conflict (radio_prayer_id) do nothing`,
    [radioPrayerId, userId, tokens, tokens * s.centsPerToken],
  );
}

/** A radio prayer that never went out was refunded, so nothing is owed for it. */
export async function onRadioRefund(q: Queryable, radioPrayerId: string) {
  await q.query(`update public.material_help_matches set status = 'cancelled' where radio_prayer_id = $1 and status = 'owed'`, [radioPrayerId]);
}

export async function summary(q: Queryable) {
  const { rows } = await q.query<{ owed_count: number; owed_cents: number; fulfilled_count: number; fulfilled_cents: number; oldest_owed: string | null }>(
    `select count(*) filter (where status = 'owed')::int as owed_count, coalesce(sum(cents) filter (where status = 'owed'), 0)::int8::float8 as owed_cents,
            count(*) filter (where status = 'fulfilled')::int as fulfilled_count, coalesce(sum(cents) filter (where status = 'fulfilled'), 0)::int8::float8 as fulfilled_cents,
            min(created_at) filter (where status = 'owed') as oldest_owed
       from public.material_help_matches`,
  );
  const r = rows[0]!;
  return { settings: await settings(q), owed: { count: r.owed_count, cents: r.owed_cents, since: r.oldest_owed }, fulfilled: { count: r.fulfilled_count, cents: r.fulfilled_cents } };
}

export const Fulfill = z.object({
  /** What was given, e.g. "groceries" or "rent help" (shown on the public fund report). */
  helpKind: z.string().trim().min(1).max(60),
  publicNote: z.string().trim().max(200).optional(),
  occurredOn: z.iso.date().optional(),
});

/**
 * Record that the help owed so far was sent: one "help sent" entry in the
 * Common Prayer Fund for the whole owed amount, and every owed match marked fulfilled.
 */
export async function fulfill(q: Queryable, adminId: string, input: z.infer<typeof Fulfill>) {
  const { rows } = await q.query<{ id: string; cents: number }>(`select id, cents from public.material_help_matches where status = 'owed' for update`);
  const cents = rows.reduce((a, r) => a + r.cents, 0);
  if (!cents) throw badRequest('No material help is owed right now');
  const entry = await commonFund.record(q, adminId, { direction: 'out', source: 'help', amountCents: cents, helpKind: input.helpKind, publicNote: input.publicNote, occurredOn: input.occurredOn });
  await q.query(`update public.material_help_matches set status = 'fulfilled', fulfilled_by = $2, fulfilled_at = now(), common_fund_entry_id = $3 where id = any($1)`, [
    rows.map((r) => r.id),
    adminId,
    entry.id,
  ]);
  return { fulfilled: rows.length, cents, entryId: entry.id as string };
}
