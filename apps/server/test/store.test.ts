// Token purchase through the App Store, checked by Apple's own verifier against a
// test certificate chain (test/storekit.ts). purchases_enabled and the products are
// shared rows, so the cases run in rolled-back transactions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import * as fund from '../src/modules/common-fund/index.js';
import * as store from '../src/modules/store/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { createUser, db } from './helpers.js';
import { makeStoreKit } from './storekit.js';

const kit = makeStoreKit();

afterAll(async () => {
  await db.end();
});

let c: pg.PoolClient;
async function inTx(fn: () => Promise<void>) {
  c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`update public.future_settings set purchases_enabled = true, common_fund_percent = 10, common_fund_page_enabled = true`);
    await c.query(`insert into public.token_products (sku, tokens, price_label, apple_product_id, active) values
                     ('test_tokens_50', 50, '$0.99', 'test.tokens.50', true),
                     ('test_priestly_5', 5, '$4.99', 'test.priestly.5', true),
                     ('test_tokens_off', 500, '$9.99', 'test.tokens.off', false)
                   on conflict (sku) do nothing`);
    await c.query(`update public.token_products set currency = 'priestly' where sku = 'test_priestly_5'`);
    await fn();
  } finally {
    await c.query('rollback');
    c.release();
  }
}

describe('App Store token purchase', () => {
  let member: string;
  let other: string;
  beforeAll(async () => {
    member = await createUser('Buyer');
    other = await createUser('Someone Else');
  });

  it('credits a verified purchase once, records the fund share, and refuses replays', () =>
    inTx(async () => {
      const jws = kit.transaction({ userId: member, productId: 'test.tokens.50', price: 990 });
      const first = await store.purchase(c, kit.verifier, member, { platform: 'ios', signedTransaction: jws });
      expect(first).toMatchObject({ tokens: 50, currency: 'regular', status: 'credited', balance: 50 });
      // The app retries after a dropped connection: same answer, no second credit.
      expect(await store.purchase(c, kit.verifier, member, { platform: 'ios', signedTransaction: jws })).toMatchObject({ id: first.id, balance: 50 });
      // Another account can't claim it.
      await expect(store.purchase(c, kit.verifier, other, { platform: 'ios', signedTransaction: jws })).rejects.toThrow('another account');
      const report = await fund.report(c);
      if (!report.enabled) throw new Error('expected the fund report');
      expect(report.recent.find((r) => r.label === 'Share of token purchases')?.cents).toBe(10); // 10% of $0.99, rounded
      expect((await store.mine(c, member))[0]).toMatchObject({ store_product_id: 'test.tokens.50', tokens: 50 });
    }));

  it('credits Priestly packs as Priestly tokens', () =>
    inTx(async () => {
      const r = await store.purchase(c, kit.verifier, member, { platform: 'ios', signedTransaction: kit.transaction({ userId: member, productId: 'test.priestly.5', price: 4990 }) });
      expect(r).toMatchObject({ tokens: 5, currency: 'priestly' });
      expect(await tokens.balanceOf(c, member, 'priestly')).toBe(5);
    }));

  it('refuses forged, foreign, refunded, inactive and non-consumable transactions', () =>
    inTx(async () => {
      const buy = (signedTransaction: string, userId = member) => store.purchase(c, kit.verifier, userId, { platform: 'ios', signedTransaction });
      // Signed by a different chain that the server doesn't trust.
      const forger = makeStoreKit();
      await expect(buy(forger.transaction({ userId: member, productId: 'test.tokens.50' }))).rejects.toThrow("couldn't be verified");
      // An intermediate without Apple's marker.
      const fake = makeStoreKit(false);
      const fakeVerifier = fake.verifier;
      await expect(store.purchase(c, fakeVerifier, member, { platform: 'ios', signedTransaction: fake.transaction({ userId: member, productId: 'test.tokens.50' }) })).rejects.toThrow("couldn't be verified");
      // Tampered payload.
      const [h, , sig] = kit.transaction({ userId: member, productId: 'test.tokens.50' }).split('.');
      const tampered = `${h}.${Buffer.from(JSON.stringify({ productId: 'test.tokens.50', transactionId: '1', appAccountToken: member, bundleId: 'com.zoomatech.prayertower', environment: 'Sandbox', type: 'Consumable', signedDate: Date.now() })).toString('base64url')}.${sig}`;
      await expect(buy(tampered)).rejects.toThrow("couldn't be verified");
      await expect(buy(kit.transaction({ userId: member, productId: 'test.tokens.50', bundleId: 'com.example.other' }))).rejects.toThrow("couldn't be verified");
      await expect(buy(kit.transaction({ userId: other, productId: 'test.tokens.50' }))).rejects.toThrow('another account');
      await expect(buy(kit.transaction({ userId: member, productId: 'test.tokens.50', revocationDate: Date.now() }))).rejects.toThrow('refunded');
      await expect(buy(kit.transaction({ userId: member, productId: 'test.tokens.off' }))).rejects.toThrow('not on sale');
      await expect(buy(kit.transaction({ userId: member, productId: 'test.tokens.50', type: 'Non-Consumable' }))).rejects.toThrow('token packs');
      expect(await tokens.balanceOf(c, member)).toBe(0);

      await c.query('update public.future_settings set purchases_enabled = false');
      await expect(buy(kit.transaction({ userId: member, productId: 'test.tokens.50' }))).rejects.toThrow('not available yet');
      await c.query('update public.future_settings set purchases_enabled = true');
      await expect(store.purchase(c, null, member, { platform: 'ios', signedTransaction: kit.transaction({ userId: member, productId: 'test.tokens.50' }) })).rejects.toThrow('not set up');
    }));

  it('takes tokens back on an App Store refund, once, and voids the fund share', () =>
    inTx(async () => {
      const jws = kit.transaction({ userId: member, productId: 'test.tokens.50' });
      await store.purchase(c, kit.verifier, member, { platform: 'ios', signedTransaction: jws });
      const refund = kit.notification('REFUND', jws);
      expect(await store.handleNotification(c, kit.verifier, refund)).toEqual({ handled: 'refunded' });
      expect(await store.handleNotification(c, kit.verifier, refund)).toEqual({ handled: 'duplicate' });
      expect(await store.handleNotification(c, kit.verifier, kit.notification('REFUND', jws))).toEqual({ handled: 'already_refunded' });
      expect(await tokens.balanceOf(c, member)).toBe(0);
      expect((await store.mine(c, member))[0]).toMatchObject({ status: 'refunded' });
      const report = await fund.report(c);
      if (!report.enabled) throw new Error('expected the fund report');
      expect(report.recent.some((r) => r.label === 'Share of token purchases')).toBe(false);
      const { rows } = await c.query(`select title from public.notifications where user_id = $1 and kind = 'token_purchase_refunded'`, [member]);
      expect(rows).toHaveLength(1);
      expect(await store.handleNotification(c, kit.verifier, kit.notification('CONSUMPTION_REQUEST', jws))).toEqual({ handled: 'ignored' });
      await expect(store.handleNotification(c, kit.verifier, makeStoreKit().notification('REFUND', jws))).rejects.toThrow("couldn't be verified");
    }));

  it("doesn't take spent tokens below zero on a refund", () =>
    inTx(async () => {
      const jws = kit.transaction({ userId: member, productId: 'test.tokens.50' });
      await store.purchase(c, kit.verifier, member, { platform: 'ios', signedTransaction: jws });
      await tokens.forfeit(c, member, 30, member, `spend:${member}`, 'spent elsewhere');
      expect(await store.handleNotification(c, kit.verifier, kit.notification('REFUND', jws))).toEqual({ handled: 'refunded' });
      expect(await tokens.balanceOf(c, member)).toBe(20);
    }));

  it('builds no verifier until a root certificate is configured', () => {
    const base = { APPLE_IAP_ENVIRONMENT: 'Sandbox' as const, APPLE_BUNDLE_ID: 'com.zoomatech.prayertower', APPLE_APP_APPLE_ID: undefined };
    expect(store.appleVerifier({ ...base, APPLE_ROOT_CA_PATHS: '' })).toBeNull();
    expect(store.appleVerifier({ ...base, APPLE_ROOT_CA_PATHS: kit.rootPath })).not.toBeNull();
    expect(() => store.appleVerifier({ ...base, APPLE_IAP_ENVIRONMENT: 'Production', APPLE_ROOT_CA_PATHS: kit.rootPath })).toThrow('APPLE_APP_APPLE_ID');
  });
});
