// Groundwork for blocked features, all switched off (see the migration
// 20261028101100_blocked_scaffolding.sql and the Phase 3 Gap List):
// token purchase, the Common Prayer Fund page, and the AI conversation with
// a persistent "not God" warning. Nothing here takes money or calls an AI.
import { z } from 'zod';
import type { Queryable } from '../../db.js';
import { AppError, forbidden } from '../../errors.js';

export interface FutureSettings {
  purchases_enabled: boolean;
  common_fund_percent: number;
  common_fund_page_enabled: boolean;
  ai_chat_enabled: boolean;
  ai_chat_warning: string;
}

export async function settings(q: Queryable): Promise<FutureSettings> {
  const { rows } = await q.query<FutureSettings>(
    `select purchases_enabled, common_fund_percent::float8 as common_fund_percent, common_fund_page_enabled, ai_chat_enabled, ai_chat_warning
       from public.future_settings`,
  );
  return rows[0]!;
}

export const SettingsPatch = z.object({
  purchasesEnabled: z.boolean().optional(),
  commonFundPercent: z.number().min(0).max(100).optional(),
  commonFundPageEnabled: z.boolean().optional(),
  aiChatEnabled: z.boolean().optional(),
  aiChatWarning: z.string().trim().min(20).max(1000).optional(),
});

export async function updateSettings(q: Queryable, p: z.infer<typeof SettingsPatch>) {
  await q.query(
    `update public.future_settings set
       purchases_enabled = coalesce($1, purchases_enabled), common_fund_percent = coalesce($2, common_fund_percent),
       common_fund_page_enabled = coalesce($3, common_fund_page_enabled), ai_chat_enabled = coalesce($4, ai_chat_enabled),
       ai_chat_warning = coalesce($5, ai_chat_warning)`,
    [p.purchasesEnabled ?? null, p.commonFundPercent ?? null, p.commonFundPageEnabled ?? null, p.aiChatEnabled ?? null, p.aiChatWarning ?? null],
  );
  return settings(q);
}

// Token purchase ------------------------------------------------------------------

export async function store(q: Queryable) {
  const s = await settings(q);
  if (!s.purchases_enabled) return { enabled: false, products: [] };
  const { rows } = await q.query(`select sku, tokens, price_label, apple_product_id, google_product_id from public.token_products where active order by tokens`);
  return {
    enabled: true,
    commonFundPercent: s.common_fund_percent,
    products: rows.map((r) => ({ sku: r.sku, tokens: r.tokens, priceLabel: r.price_label, appleProductId: r.apple_product_id, googleProductId: r.google_product_id })),
  };
}

export const Purchase = z.object({ sku: z.string(), platform: z.enum(['ios', 'android']), receipt: z.string().min(1).max(100_000) });

/**
 * Refused while purchases are off. Even when switched on, the store receipt
 * check (App Store Server API / Google Play Developer API) isn't built yet, so
 * no tokens are ever credited from here until it is.
 */
export async function purchase(q: Queryable, _userId: string, _input: z.infer<typeof Purchase>): Promise<never> {
  const s = await settings(q);
  if (!s.purchases_enabled) throw forbidden('Buying tokens is not available yet. You can earn tokens by praying.');
  throw new AppError(501, 'not_implemented', 'Store receipt checking is not set up yet');
}

// Common Prayer Fund ------------------------------------------------------------------

/** The public page: what the fund is for and the help the Witness team has sent so far. */
export async function commonFund(q: Queryable) {
  const s = await settings(q);
  if (!s.common_fund_page_enabled) return { enabled: false };
  const { rows } = await q.query<{ cases_helped: number; help_sent: number }>(
    `select (select count(*)::int from public.witness_cases where status in ('helped', 'closed')
               and exists (select 1 from public.witness_notes n where n.case_id = witness_cases.id and n.help_kind is not null)) as cases_helped,
            (select count(*)::int from public.witness_notes where help_kind is not null) as help_sent`,
  );
  return {
    enabled: true,
    percent: s.common_fund_percent,
    about: `A share (${s.common_fund_percent}%) of every token purchase goes to the Common Prayer Fund, which pays for the Witness team's direct help to people in real need.`,
    peopleHelped: rows[0]!.cases_helped,
    helpSent: rows[0]!.help_sent,
  };
}

// AI conversation (not God) ----------------------------------------------------------------

export const AiChat = z.object({ message: z.string().trim().min(1).max(2000) });

/** Off by default. With the switch on but no AI provider wired, it answers with the warning only. */
export async function aiChat(q: Queryable, _userId: string, _input: z.infer<typeof AiChat>) {
  const s = await settings(q);
  if (!s.ai_chat_enabled) throw forbidden('This feature is not available');
  return {
    warning: s.ai_chat_warning,
    reply: 'This conversation is not set up yet. Please bring your prayer to God directly, or ask a prayer partner to pray with you.',
  };
}

export async function aiChatInfo(q: Queryable) {
  const s = await settings(q);
  return { enabled: s.ai_chat_enabled, warning: s.ai_chat_warning };
}
