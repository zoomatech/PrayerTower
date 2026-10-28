// Penalties for using prayer requests as ads (Annotated Read, chat 10), behind
// ad_fine_settings.enabled (off by default; migration 20261029001100_ad_fines.sql).
// A removal under the "No ads" rule forfeits tokens, records a fine and, for a
// repeat offender, suspends the account for longer each time. Collecting money
// is not built: a fine is recorded and shown, and an admin marks it paid or waives it.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { conflict, notFound } from '../../errors.js';
import * as tokens from '../tokens/index.js';

export interface AdFineSettings {
  enabled: boolean;
  forfeit_tokens: number;
  fine_cents: number;
  repeat_suspend_days: number;
  lookback_days: number;
}

export async function settings(q: Queryable): Promise<AdFineSettings> {
  const { rows } = await q.query<AdFineSettings>(
    'select enabled, forfeit_tokens, fine_cents, repeat_suspend_days, lookback_days from public.ad_fine_settings',
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  enabled: z.boolean().optional(),
  forfeitTokens: z.number().int().min(0).max(10000).optional(),
  fineCents: z.number().int().min(0).max(1_000_000).optional(),
  repeatSuspendDays: z.number().int().min(0).max(365).optional(),
  lookbackDays: z.number().int().min(1).max(3650).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.ad_fine_settings set enabled = coalesce($1, enabled), forfeit_tokens = coalesce($2, forfeit_tokens),
            fine_cents = coalesce($3, fine_cents), repeat_suspend_days = coalesce($4, repeat_suspend_days),
            lookback_days = coalesce($5, lookback_days)`,
    [p.enabled ?? null, p.forfeitTokens ?? null, p.fineCents ?? null, p.repeatSuspendDays ?? null, p.lookbackDays ?? null],
  );
  return settings(q);
}

export interface AppliedFine {
  id: string;
  offense: number;
  tokensForfeited: number;
  fineCents: number;
  suspendDays: number;
  /** The forfeit transfer, so an overturned appeal returns the tokens. */
  transferId: string | null;
}

/**
 * Called by a moderator's removal under the "No ads" rule. Returns null when the
 * switch is off. Suspension: none for a first offense, then repeat_suspend_days,
 * doubling for each later one (at most a year).
 */
export async function apply(q: Queryable, itemId: string, userId: string, moderatorId: string): Promise<AppliedFine | null> {
  const s = await settings(q);
  if (!s.enabled) return null;
  const { rows: prior } = await q.query<{ n: number }>(
    `select count(*)::int as n from public.ad_fines
      where user_id = $1 and status <> 'waived' and created_at > now() - make_interval(days => $2)`,
    [userId, s.lookback_days],
  );
  const offense = prior[0]!.n + 1;
  const suspendDays = offense === 1 || s.repeat_suspend_days === 0 ? 0 : Math.min(365, s.repeat_suspend_days * 2 ** (offense - 2));
  const t = s.forfeit_tokens > 0 ? await tokens.forfeit(q, userId, s.forfeit_tokens, moderatorId, `adfine:${itemId}`, 'No ads: tokens forfeited') : null;
  const { rows } = await q.query<{ id: string }>(
    `insert into public.ad_fines (moderation_item_id, user_id, offense, tokens_forfeited, fine_cents, suspend_days, status)
     values ($1, $2, $3, $4, $5, $6, case when $5 > 0 then 'owed' else 'waived' end::public.ad_fine_status) returning id`,
    [itemId, userId, offense, t ? Number(t.amount) : 0, s.fine_cents, suspendDays],
  );
  return { id: rows[0]!.id, offense, tokensForfeited: t ? Number(t.amount) : 0, fineCents: s.fine_cents, suspendDays, transferId: t?.id ?? null };
}

/** "$25.00" */
export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The sentence added to the removal notice. */
export function noticeLine(f: AppliedFine): string {
  const parts = [
    f.tokensForfeited ? `${f.tokensForfeited} token${f.tokensForfeited === 1 ? '' : 's'} were forfeited` : null,
    f.fineCents ? `a fine of ${dollars(f.fineCents)} was recorded` : null,
  ].filter(Boolean);
  return parts.length ? ` Because prayer requests may not be used as ads, ${parts.join(' and ')}.` : '';
}

/** An overturned appeal: the fine is waived (the tokens come back through the forfeit reversal). */
export async function waiveForItem(q: Queryable, itemId: string, moderatorId: string) {
  await q.query(
    `update public.ad_fines set status = 'waived', decided_by = $2, decided_at = now(), note = 'Appeal overturned'
      where moderation_item_id = $1 and status <> 'waived'`,
    [itemId, moderatorId],
  );
}

export interface AdFine {
  id: string;
  user_id: string;
  member_name: string | null;
  moderation_item_id: string;
  offense: number;
  tokens_forfeited: number;
  fine_cents: number;
  suspend_days: number;
  status: 'owed' | 'paid' | 'waived';
  note: string | null;
  decided_at: string | null;
  created_at: string;
}

export const ListFilter = z.object({ status: z.enum(['owed', 'paid', 'waived']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

export async function list(q: Queryable, f: z.infer<typeof ListFilter>, userId?: string): Promise<AdFine[]> {
  const { rows } = await q.query<AdFine>(
    `select f.id, f.user_id, p.display_name as member_name, f.moderation_item_id, f.offense, f.tokens_forfeited, f.fine_cents,
            f.suspend_days, f.status, f.note, f.decided_at, f.created_at
       from public.ad_fines f left join public.profiles p on p.id = f.user_id
      where ($1::public.ad_fine_status is null or f.status = $1) and ($2::uuid is null or f.user_id = $2)
      order by f.created_at desc, f.id desc limit $3`,
    [f.status ?? null, userId ?? null, f.limit],
  );
  return rows;
}

export const Resolve = z.object({ status: z.enum(['paid', 'waived']), note: z.string().trim().max(500).optional() });

/** An admin records that an owed fine was paid (outside the app) or waives it. */
export async function resolve(q: Queryable, id: string, adminId: string, r: z.infer<typeof Resolve>) {
  const { rows } = await q.query<{ status: string }>('select status from public.ad_fines where id = $1 for update', [id]);
  if (!rows[0]) throw notFound('Fine');
  if (rows[0].status !== 'owed') throw conflict(`This fine is already ${rows[0].status}`);
  await q.query(`update public.ad_fines set status = $2, decided_by = $3, decided_at = now(), note = $4 where id = $1`, [
    id,
    r.status,
    adminId,
    r.note ?? null,
  ]);
  return (await list(q, { limit: 200 })).find((f) => f.id === id)!;
}
