// Token purchase through the App Store (migration 20261029003600_token_purchases.sql).
// Behind future_settings.purchases_enabled (off). The app buys a consumable with
// StoreKit 2, passing the member's id as appAccountToken, and sends the signed
// transaction (JWS). Apple's signature is checked with Apple's App Store Server
// Library before any token moves, and each transaction credits once. Refunds come
// back as App Store Server Notifications V2 and take the tokens back.
import { readFileSync } from 'node:fs';
import {
  Environment,
  NotificationTypeV2,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import type { DatabaseError } from 'pg';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { Queryable } from '../../db.js';
import { AppError, badRequest, conflict, forbidden } from '../../errors.js';
import * as future from '../future/index.js';
import * as notifications from '../notifications/index.js';
import * as tokens from '../tokens/index.js';

/** What the store module needs from Apple's verifier (tests pass one built on a test certificate chain). */
export interface AppleVerifier {
  verifyAndDecodeTransaction(jws: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeNotification(jws: string): Promise<ResponseBodyV2DecodedPayload>;
}

/** Apple's verifier from config, or null while no root certificate is configured (purchases stay refused). */
export function appleVerifier(config: Pick<Config, 'APPLE_ROOT_CA_PATHS' | 'APPLE_IAP_ENVIRONMENT' | 'APPLE_BUNDLE_ID' | 'APPLE_APP_APPLE_ID'>): AppleVerifier | null {
  const paths = config.APPLE_ROOT_CA_PATHS.split(',').map((p) => p.trim()).filter(Boolean);
  if (!paths.length) return null;
  const env = config.APPLE_IAP_ENVIRONMENT === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
  if (env === Environment.PRODUCTION && !config.APPLE_APP_APPLE_ID) throw new Error('APPLE_APP_APPLE_ID is required when APPLE_IAP_ENVIRONMENT=Production');
  // Online checks: certificate revocation (OCSP) and expiry against today's date.
  return new SignedDataVerifier(paths.map((p) => readFileSync(p)), true, env, config.APPLE_BUNDLE_ID, config.APPLE_APP_APPLE_ID);
}

export const Purchase = z.object({
  platform: z.literal('ios'),
  /** StoreKit 2 Transaction.jwsRepresentation. */
  signedTransaction: z.string().min(20).max(20_000),
});

export interface PurchaseResult {
  id: string;
  tokens: number;
  currency: 'regular' | 'priestly';
  status: 'credited' | 'refunded';
  balance: number;
}

async function verify<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    // VerificationException: bad signature, wrong app, wrong environment or a chain Apple didn't issue.
    throw badRequest("This purchase couldn't be verified with the App Store");
  }
}

/** Credit a verified App Store purchase to the member, once per transaction. */
export async function purchase(q: Queryable, verifier: AppleVerifier | null, userId: string, input: z.infer<typeof Purchase>): Promise<PurchaseResult> {
  const s = await future.settings(q);
  if (!s.purchases_enabled) throw forbidden('Buying tokens is not available yet. You can earn tokens by praying.');
  if (!verifier) throw new AppError(503, 'store_not_configured', 'The App Store connection is not set up yet');
  const t = await verify(() => verifier.verifyAndDecodeTransaction(input.signedTransaction));
  if (!t.transactionId || !t.productId) throw badRequest('This purchase is incomplete');
  // The app sets appAccountToken to the member's id, so a transaction can't be replayed by another account.
  if (t.appAccountToken?.toLowerCase() !== userId.toLowerCase()) throw forbidden('This purchase belongs to another account');
  if (t.revocationDate) throw conflict('This purchase was refunded');
  if (t.type !== 'Consumable') throw badRequest('Only token packs can be bought here');

  const existing = await q.query<{ id: string; user_id: string | null; tokens: number; currency: 'regular' | 'priestly'; status: 'credited' | 'refunded' }>(
    `select id, user_id, tokens, currency, status from public.token_purchases where platform = 'ios' and transaction_id = $1`,
    [t.transactionId],
  );
  if (existing.rows[0]) {
    const e = existing.rows[0];
    if (e.user_id !== userId) throw forbidden('This purchase belongs to another account');
    return { id: e.id, tokens: e.tokens, currency: e.currency, status: e.status, balance: await tokens.balanceOf(q, userId, e.currency) };
  }

  const { rows: p } = await q.query<{ id: string; tokens: number; currency: 'regular' | 'priestly' }>(
    'select id, tokens, currency from public.token_products where apple_product_id = $1 and active',
    [t.productId],
  );
  const product = p[0];
  if (!product) throw badRequest('This token pack is not on sale');
  const amount = product.tokens * Math.max(1, t.quantity ?? 1);
  const transfer = await tokens.creditPurchase(q, userId, amount, `purchase:apple:${t.transactionId}`, product.currency);

  // The Common Prayer Fund's share (future_settings.common_fund_percent), recorded for its public report.
  // Recorded only for prices in US dollars, the fund's currency.
  let fundEntryId: string | null = null;
  if (t.price && t.currency === 'USD' && s.common_fund_percent > 0) {
    const cents = Math.round(((t.price / 10) * s.common_fund_percent) / 100);
    if (cents > 0) {
      const { rows: f } = await q.query<{ id: string }>(
        `insert into public.common_fund_entries (direction, source, amount_cents, occurred_on, public_note)
         values ('in', 'purchase_share', $1, current_date, 'Share of a token purchase') returning id`,
        [cents],
      );
      fundEntryId = f[0]!.id;
    }
  }

  try {
    const { rows } = await q.query<{ id: string }>(
      `insert into public.token_purchases (user_id, platform, product_id, store_product_id, transaction_id, original_transaction_id, environment,
                                           tokens, currency, price_milli, price_currency, transfer_id, fund_entry_id, purchased_at)
       values ($1, 'ios', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13::float8 / 1000)) returning id`,
      [
        userId,
        product.id,
        t.productId,
        t.transactionId,
        t.originalTransactionId ?? null,
        String(t.environment ?? ''),
        amount,
        product.currency,
        t.price ?? null,
        t.currency ?? null,
        transfer.id,
        fundEntryId,
        t.purchaseDate ?? Date.now(),
      ],
    );
    return { id: rows[0]!.id, tokens: amount, currency: product.currency, status: 'credited', balance: await tokens.balanceOf(q, userId, product.currency) };
  } catch (err) {
    // Two requests for the same transaction at once: the ledger's idempotency key already stopped a double credit.
    if ((err as DatabaseError).code === '23505') throw conflict('This purchase is already being recorded');
    throw err;
  }
}

/** The member's purchases, newest first. */
export async function mine(q: Queryable, userId: string) {
  const { rows } = await q.query(
    `select id, store_product_id, tokens, currency, status, price_milli, price_currency, purchased_at, refunded_at
       from public.token_purchases where user_id = $1 order by created_at desc limit 50`,
    [userId],
  );
  return rows;
}

/**
 * An App Store Server Notification V2. REFUND and REVOKE take the tokens back
 * (as far as the balance allows) and void the fund share; everything else is
 * acknowledged. Each notification is handled once.
 */
export async function handleNotification(q: Queryable, verifier: AppleVerifier | null, signedPayload: string): Promise<{ handled: string }> {
  if (!verifier) throw new AppError(503, 'store_not_configured', 'The App Store connection is not set up yet');
  const n = await verify(() => verifier.verifyAndDecodeNotification(signedPayload));
  if (!n.notificationUUID || !n.notificationType) throw badRequest('Incomplete notification');
  const { rowCount } = await q.query(
    `insert into public.store_notifications (notification_uuid, notification_type, subtype) values ($1, $2, $3) on conflict do nothing`,
    [n.notificationUUID, n.notificationType, n.subtype ?? null],
  );
  if (!rowCount) return { handled: 'duplicate' };
  if (n.notificationType !== NotificationTypeV2.REFUND && n.notificationType !== NotificationTypeV2.REVOKE) return { handled: 'ignored' };
  const signedTransaction = n.data?.signedTransactionInfo;
  if (!signedTransaction) return { handled: 'ignored' };
  const t = await verify(() => verifier.verifyAndDecodeTransaction(signedTransaction));
  return { handled: await refund(q, t.transactionId ?? '') };
}

async function refund(q: Queryable, transactionId: string): Promise<string> {
  const { rows } = await q.query<{ id: string; user_id: string | null; tokens: number; currency: 'regular' | 'priestly'; status: string; transfer_id: string; fund_entry_id: string | null }>(
    `select id, user_id, tokens, currency, status, transfer_id, fund_entry_id from public.token_purchases
      where platform = 'ios' and transaction_id = $1 for update`,
    [transactionId],
  );
  const p = rows[0];
  if (!p) return 'unknown_purchase';
  if (p.status === 'refunded') return 'already_refunded';
  let refundTransferId: string | null = null;
  let note: string | null = null;
  if (p.user_id) {
    // A savepoint, so a refused clawback doesn't abort the caller's transaction.
    await q.query('savepoint store_refund');
    try {
      refundTransferId = (await tokens.clawback(q, p.transfer_id, p.user_id, 'App Store refund')).id;
      await q.query('release savepoint store_refund');
    } catch (err) {
      await q.query('rollback to savepoint store_refund');
      // The tokens were already spent or given away: nothing is taken below zero.
      if ((err as AppError).code !== 'insufficient_tokens') throw err;
      note = 'Tokens already spent; nothing taken back';
    }
  }
  if (p.fund_entry_id) await q.query('update public.common_fund_entries set voided_at = now() where id = $1 and voided_at is null', [p.fund_entry_id]);
  await q.query(`update public.token_purchases set status = 'refunded', refund_transfer_id = $2, refund_note = $3, refunded_at = now() where id = $1`, [
    p.id,
    refundTransferId,
    note,
  ]);
  if (p.user_id) {
    await notifications.notify(q, p.user_id, {
      kind: 'token_purchase_refunded',
      title: 'Your token purchase was refunded',
      body: refundTransferId ? `Apple refunded your purchase, so ${p.tokens} tokens were taken back.` : 'Apple refunded your purchase.',
      data: { purchaseId: p.id },
      dedupeKey: `token_purchase_refunded:${p.id}`,
    });
  }
  return 'refunded';
}
