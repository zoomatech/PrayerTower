// Fines for using prayer requests as ads (off by default). The switch is one shared row, so
// the "on" cases run inside a transaction that is rolled back and other test files never see it.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as adFines from '../src/modules/ad-fines/index.js';
import * as moderation from '../src/modules/moderation/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(async () => {
  await db.end();
});

const PRODUCTS = ['candles', 'oils', 'books', 'shirts'];
let n = 0;

async function reportedAd(poster: string, reporter: string, moderator: string) {
  const post = await newRequest(poster, `Buy my ${PRODUCTS[n++ % PRODUCTS.length]} at example.com, 20% off this week`);
  await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Ad' });
  return (await as(moderator).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string;
}

describe('ad fines', () => {
  it('is off by default: an ads removal takes nothing extra', async () => {
    const [poster, reporter, mod] = [await createUser('Seller'), await createUser('Reporter'), await createUser('Mod')];
    await grantRole(db, mod, 'moderator', null);
    await tokens.earn(db, poster, 20, `test:${poster}`, 'test');
    const item = await reportedAd(poster, reporter, mod);
    expect((await as(mod).post(`/moderation/items/${item}/decision`, { action: 'remove', rule: 'ads' })).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, poster)).toBe(20);
    expect((await as(poster).get('/me/ad-fines')).json().fines).toEqual([]);
  });

  it('when on, forfeits tokens, records the fine, suspends repeats, and an overturned appeal undoes it', async () => {
    const [poster, reporter, mod, mod2, admin] = [await createUser('Seller'), await createUser('Reporter'), await createUser('Mod'), await createUser('Mod2'), await createUser('Admin')];
    await grantRole(db, mod, 'moderator', null);
    await grantRole(db, mod2, 'moderator', null);
    await tokens.earn(db, poster, 30, `test:${poster}`, 'test');
    const first = await reportedAd(poster, reporter, mod);
    const second = await reportedAd(poster, reporter, mod);
    const third = await reportedAd(poster, reporter, mod);

    const c = await db.connect();
    try {
      await c.query('begin');
      await adFines.updateSettings(c, { enabled: true, forfeitTokens: 10, fineCents: 2500, repeatSuspendDays: 7 });
      await moderation.decide(c, mod, first, { action: 'remove', rule: 'ads', clawbackTransferIds: [] });
      await moderation.decide(c, mod, second, { action: 'remove', rule: 'ads', clawbackTransferIds: [] });
      await moderation.decide(c, mod, third, { action: 'remove', rule: 'ads', clawbackTransferIds: [] });

      const fines = await adFines.list(c, { limit: 50 }, poster);
      expect(fines.map((f) => [f.offense, f.tokens_forfeited, f.fine_cents, f.suspend_days, f.status])).toEqual([
        [3, 10, 2500, 14, 'owed'],
        [2, 10, 2500, 7, 'owed'],
        [1, 10, 2500, 0, 'owed'],
      ]);
      expect(await tokens.balanceOf(c, poster)).toBe(0);
      const { rows: p } = await c.query<{ until: Date }>('select suspended_until as until from public.profiles where id = $1', [poster]);
      expect(p[0]!.until.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
      const { rows: n } = await c.query<{ body: string }>(
        `select body from public.notifications where user_id = $1 and kind = 'moderation_notice' order by created_at limit 1`,
        [poster],
      );
      expect(n[0]!.body).toContain('10 tokens were forfeited and a fine of $25.00 was recorded');

      // The first one is appealed and overturned: its fine is waived and its 10 tokens come back.
      const { id: appealId } = await moderation.appeal(c, poster, first, { message: 'It was a real request' });
      await moderation.decideAppeal(c, mod2, appealId, { action: 'overturn' });
      expect((await adFines.list(c, { limit: 50 }, poster)).find((f) => f.offense === 1)!.status).toBe('waived');
      expect(await tokens.balanceOf(c, poster)).toBe(10);

      // An admin records a payment; it can't be resolved twice.
      await grantRole(c, admin, 'admin', null);
      const paid = await adFines.resolve(c, fines[1]!.id, admin, { status: 'paid', note: 'Check received' });
      expect(paid).toMatchObject({ status: 'paid', note: 'Check received' });
      await expect(adFines.resolve(c, fines[1]!.id, admin, { status: 'waived' })).rejects.toThrow('already paid');
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('settings and the fines list are admin-only, and members can export their fines', async () => {
    const admin = await createUser('Admin');
    const member = await createUser('Member');
    await grantRole(db, admin, 'admin', null);
    expect((await as(member).get('/admin/ad-fines')).statusCode).toBe(403);
    expect((await as(member).patch('/admin/ad-fine-settings', { enabled: true })).statusCode).toBe(403);
    expect((await as(admin).get('/admin/ad-fine-settings')).json().settings).toMatchObject({ enabled: false, forfeit_tokens: 10, fine_cents: 0 });
    expect((await as(admin).patch('/admin/ad-fine-settings', { fineCents: -1 })).statusCode).toBe(400);
    expect((await as(admin).get('/admin/ad-fines?status=owed')).statusCode).toBe(200);
    expect((await as(member).get('/me/export')).json()).toHaveProperty('adFines', []);
  });
});
