// Practice mode for the paid services (Admin → Practice mode). Shared settings
// rows change here, so the cases run in rolled-back transactions.
import { generateKeyPairSync } from 'node:crypto';
import { importSPKI, jwtVerify } from 'jose';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as autoPray from '../src/modules/ai/auto-pray.js';
import * as ai from '../src/modules/ai/index.js';
import * as live from '../src/modules/live/index.js';
import * as practice from '../src/modules/practice-mode/index.js';
import * as store from '../src/modules/store/index.js';
import { as, createUser, db } from './helpers.js';
import { makeStoreKit } from './storekit.js';

afterAll(() => db.end());

let c: pg.PoolClient;
async function inTx(fn: () => Promise<void>) {
  c = await db.connect();
  try {
    await c.query('begin');
    await fn();
  } finally {
    await c.query('rollback');
    c.release();
  }
}

const practiceTx = (productId: string, appAccountToken: string, transactionId = crypto.randomUUID()) =>
  `practice.${Buffer.from(JSON.stringify({ productId, appAccountToken, transactionId })).toString('base64url')}`;

describe('practice mode', () => {
  let admin: string;
  let member: string;
  let pastor: string;
  beforeAll(async () => {
    admin = await createUser('Practice Admin');
    await grantRole(db, admin, 'admin', null);
    member = await createUser('Practice Member');
    pastor = await createUser('Practice Pastor');
    await grantRole(db, pastor, 'pastor', null);
  });

  it('is off by default and only admins can see or change it', async () => {
    expect(await practice.settings(db)).toEqual({ ai: false, live: false, purchases: false });
    expect((await as(member).get('/admin/practice-mode')).statusCode).toBe(403);
    expect((await as(member).patch('/admin/practice-mode', { ai: true })).statusCode).toBe(403);
    const got = (await as(admin).get('/admin/practice-mode')).json();
    // The test app has an AI connected and no App Store connection.
    expect(got.connected).toMatchObject({ ai: true, jaas: false, appStore: false, practicePurchasesAllowed: true });
  });

  it('answers the AI features with a labelled practice reply only while no AI key is set', () =>
    inTx(async () => {
      expect(await practice.converser(c, null)).toBeNull();
      await c.query('update public.paid_practice_settings set ai = true');
      const converse = await practice.converser(c, null);
      expect(converse).toBe(practice.practiceConverse);
      const reply = await converse!('system', [{ role: 'user', content: 'Hello' }]);
      expect('text' in reply && reply.text).toMatch(/^Practice reply: no AI service is connected yet/);
      // A real key wins.
      const real = async () => ({ text: 'real' });
      expect(await practice.converser(c, real)).toBe(real);

      // The conversation itself, through ai.chat, gets the practice reply.
      await c.query('update public.future_settings set ai_chat_enabled = true');
      const r = await ai.chat(c, await practice.converser(c, null), member, { message: 'Are you there?', history: [] });
      expect(r.reply).toMatch(/^Practice reply:/);

      // Auto-Pray writes the practice text too, so the whole flow can be tried.
      expect(await autoPray.writeDue(c, null)).toBe(0); // Auto-Pray itself is still off.
    }));

  it('opens practice rooms on our own server when no video service is set', () =>
    inTx(async () => {
      await c.query('update public.live_settings set enabled = true, jitsi_url = null');
      await expect(live.start(c, pastor, { title: 'Evening' }, { base: 'https://api.example.org' })).rejects.toThrow(/No video server/);
      expect((await live.liveNow(c, member, { base: 'https://api.example.org' })).canCreateRoom).toBe(false);

      await c.query('update public.paid_practice_settings set live = true');
      const room = await live.start(c, pastor, { title: 'Evening' }, { base: 'https://api.example.org' });
      expect(room.roomUrl).toMatch(/^practice:PrayerTower-[A-Za-z0-9_-]{16}$/);
      const seen = await live.liveNow(c, member, { base: 'https://api.example.org' });
      expect(seen.canCreateRoom).toBe(true);
      const mine = seen.rooms.find((r) => r.id === room.id)!;
      expect(mine.roomUrl).toBe(`https://api.example.org/live/practice/${room.roomUrl.slice('practice:'.length)}`);
    }));

  it('serves the practice room page without sign-in, and says there is no video', async () => {
    const page = await as(member).get('/live/practice/PrayerTower-abcdefgh12345678');
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body).toMatch(/No video service is connected yet/);
    expect((await as(member).get('/live/practice/%3Cscript%3E')).statusCode).toBe(400);
  });

  it('signs a JaaS token per member when 8x8 keys are set, with the host as moderator', () =>
    inTx(async () => {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jaas = {
        appId: 'vpaas-magic-cookie-0123abcd',
        keyId: 'vpaas-magic-cookie-0123abcd/4f3a21',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      };
      await c.query('update public.live_settings set enabled = true, jitsi_url = null');
      const room = await live.start(c, pastor, { title: 'Study' }, { jaas });
      expect(room.roomUrl).toMatch(/^https:\/\/8x8\.vc\/vpaas-magic-cookie-0123abcd\/PrayerTower-/);

      const key = await importSPKI(publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'RS256');
      for (const [who, moderator] of [
        [pastor, true],
        [member, false],
      ] as const) {
        const seen = (await live.liveNow(c, who, { jaas })).rooms.find((r) => r.id === room.id)!;
        const jwt = new URL(seen.roomUrl).searchParams.get('jwt')!;
        const { payload, protectedHeader } = await jwtVerify(jwt, key, { audience: 'jitsi', issuer: 'chat', subject: jaas.appId });
        expect(protectedHeader).toMatchObject({ alg: 'RS256', kid: jaas.keyId, typ: 'JWT' });
        expect(payload).toMatchObject({ room: room.roomUrl.split('/').pop(), context: { user: { id: who, moderator }, features: { recording: false } } });
      }
    }));

  it('takes practice purchases only while switched on and no App Store connection is set, never in production', () =>
    inTx(async () => {
      await c.query(`update public.future_settings set purchases_enabled = true, common_fund_percent = 10`);
      await c.query(`insert into public.token_products (sku, tokens, price_label, apple_product_id, active) values ('practice_50', 50, '$0.99', 'practice.tokens.50', true)
                     on conflict (sku) do nothing`);
      const buy = (signed: string, verifier: store.AppleVerifier | null = null, allowed = true) =>
        store.purchase(c, verifier, member, { platform: 'ios', signedTransaction: signed }, allowed);

      await expect(buy(practiceTx('practice.tokens.50', member))).rejects.toThrow(/Practice purchases are off/);
      await c.query('update public.paid_practice_settings set purchases = true');
      await expect(buy(practiceTx('practice.tokens.50', member), null, false)).rejects.toThrow(/Practice purchases are off/);
      await expect(buy(practiceTx('practice.tokens.50', member), makeStoreKit().verifier)).rejects.toThrow(/Practice purchases are off/);
      // Someone else's id can't be used.
      await expect(buy(practiceTx('practice.tokens.50', admin))).rejects.toThrow(/another account/);
      await expect(buy('practice.not-json-at-all-xx')).rejects.toThrow();

      const tx = practiceTx('practice.tokens.50', member);
      expect(await buy(tx)).toMatchObject({ tokens: 50, status: 'credited' });
      // Sent twice: credited once.
      expect((await buy(tx)).tokens).toBe(50);
      const history = await store.mine(c, member);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ practice: true, price_milli: null });
      // No money moved, so nothing goes to the Common Prayer Fund report.
      expect((await c.query(`select count(*)::int as n from public.common_fund_entries where source = 'purchase_share'`)).rows[0].n).toBe(
        (await db.query(`select count(*)::int as n from public.common_fund_entries where source = 'purchase_share'`)).rows[0].n,
      );
    }));

  it('tells the app when to use practice purchases', () =>
    inTx(async () => {
      expect(await store.practiceOn(c, null, true)).toBe(false);
      await c.query('update public.paid_practice_settings set purchases = true');
      expect(await store.practiceOn(c, null, true)).toBe(true);
      expect(await store.practiceOn(c, null, false)).toBe(false);
    }));
});
