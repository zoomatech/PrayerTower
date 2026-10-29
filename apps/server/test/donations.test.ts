import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { withTx } from '../src/db.js';
import { grantRole } from '../src/modules/accounts/index.js';
import * as donations from '../src/modules/donations/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import * as zeffy from '../src/modules/donations/zeffy.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

const defaults = await donations.settings(db);
const tokenDefaults = await tokens.settings(db);
let admin: string;
beforeAll(async () => {
  admin = await createUser('Giving Admin');
  await grantRole(db, admin, 'admin', null);
});
afterAll(async () => {
  await donations.updateSettings(db, {
    enabled: defaults.enabled, provider: defaults.provider, donateUrl: defaults.donate_url, everyoneMonthly: defaults.everyone_monthly,
    allocationRequestsEnabled: defaults.allocation_requests_enabled, priestlyPerDollar: defaults.priestly_per_dollar, regularPerDollar: defaults.regular_per_dollar,
  });
  await tokens.updateSettings(db, tokenDefaults);
  await db.end();
});

const fundBalance = async () =>
  Number((await db.query(`select coalesce(sum(balance), 0) as b from public.token_accounts where kind = 'infrastructure' and currency = 'priestly'`)).rows[0].b);

describe('giving', () => {
  it('is off by default and shows no Give button', async () => {
    expect(defaults).toMatchObject({ enabled: false, provider: 'none', everyone_monthly: 1, allocation_requests_enabled: false });
    expect((await app.inject({ url: '/donations/info' })).json()).toMatchObject({ enabled: false, provider: 'none', url: null });
    expect((await app.inject({ url: '/donations/summary' })).json()).toEqual({ enabled: false });
  });

  it('a recorded gift fills its target and thanks the giver with regular tokens', async () => {
    const giver = await createUser('Generous Gail');
    const friend = await createUser('Friend Fran');
    await as(admin).patch('/admin/donation-settings', { enabled: true, provider: 'zeffy', donateUrl: 'https://www.zeffy.com/en-US/donation-form/example', priestlyPerDollar: 2, regularPerDollar: 10 });
    expect((await app.inject({ url: '/donations/info' })).json()).toMatchObject({ enabled: true, provider: 'zeffy', url: 'https://www.zeffy.com/en-US/donation-form/example' });
    const before = await fundBalance();
    expect((await as(admin).post('/admin/donations', { amountCents: 2550, donorId: giver })).statusCode).toBe(201);
    expect(await fundBalance()).toBe(before + 50); // $25 x 2 Priestly
    expect(await tokens.balanceOf(db, giver)).toBe(250); // $25 x 10 regular
    await as(admin).post('/admin/donations', { amountCents: 500, target: { kind: 'member', userId: friend } });
    expect(await tokens.balanceOf(db, friend, 'priestly')).toBe(10);
    // Members can't record gifts or change the settings.
    expect((await as(giver).post('/admin/donations', { amountCents: 500 })).statusCode).toBe(403);
    expect((await as(giver).patch('/admin/donation-settings', { enabled: false })).statusCode).toBe(403);
    const summary = (await app.inject({ url: '/donations/summary' })).json();
    expect(summary.raisedCents).toBeGreaterThanOrEqual(3050);
    expect(JSON.stringify(summary)).not.toMatch(/Gail|Fran/);
  });

  it('everybody gets at least one radio prayer a month, then a granted allowance, then tokens', async () => {
    await donations.updateSettings(db, { enabled: true, everyoneMonthly: 1, allocationRequestsEnabled: true, allocationMaxPerRequest: 3 });
    await tokens.updateSettings(db, { radio_funding: 'tokens' });
    const member = await createUser('Needy Ned');
    const poster = await createUser('Poster Pat');
    const p1 = await newRequest(poster, 'Pray for my brother in the hospital.');
    const p2 = await newRequest(poster, 'Pray for my sister abroad.');
    const p3 = await newRequest(poster, 'Pray for my parents.');
    const first = await as(member).post(`/posts/${p1.id}/radio`, { idempotencyKey: 'need-1' });
    expect(first.json().radioPrayer.cost).toBe(0);
    expect((await as(member).get('/me/radio-allowance')).json()).toMatchObject({ freeThisMonth: 0, granted: 0, canRequest: true });
    // No Priestly tokens and no free prayer left: refused.
    expect((await as(member).post(`/posts/${p2.id}/radio`, { idempotencyKey: 'need-2' })).statusCode).toBe(409);
    // Asks for more; staff grant two.
    expect((await as(member).post('/me/radio-allocation-requests', { count: 5 })).statusCode).toBe(400);
    expect((await as(member).post('/me/radio-allocation-requests', { count: 2, note: 'For my family' })).statusCode).toBe(201);
    expect((await as(member).post('/me/radio-allocation-requests', { count: 1 })).statusCode).toBe(409);
    expect((await as(member).get('/staff/radio-allocation-requests')).statusCode).toBe(403);
    const pending = (await as(admin).get('/staff/radio-allocation-requests')).json().requests;
    const mine = pending.find((r: { name: string }) => r.name === 'Needy Ned');
    expect(mine).toMatchObject({ count: 2, note: 'For my family' });
    await as(admin).post(`/staff/radio-allocation-requests/${mine.id}/decide`, { grant: 2 });
    expect((await as(member).post(`/posts/${p2.id}/radio`, { idempotencyKey: 'need-3' })).json().radioPrayer.cost).toBe(0);
    expect((await as(member).post(`/posts/${p3.id}/radio`, { idempotencyKey: 'need-4' })).json().radioPrayer.cost).toBe(0);
    const { rows } = await db.query(`select funded_by from public.radio_prayers where user_id = $1 order by created_at`, [member]);
    expect(rows.map((r) => r.funded_by)).toEqual(['everyone', 'allowance', 'allowance']);
    expect((await as(member).get('/me/radio-allowance')).json()).toMatchObject({ granted: 0, canRequest: true });
  });

  it('Stripe: checkout starts a pending gift, and only a signed webhook marks it paid, once', async () => {
    await donations.updateSettings(db, { enabled: true, provider: 'stripe', regularPerDollar: 10, priestlyPerDollar: 1 });
    const giver = await createUser('Stripe Sam');
    const keys = { secretKey: 'sk_test_placeholder', webhookSecret: 'whsec_test_placeholder' };
    // Without keys the button stays hidden and checkout says it's not set up.
    expect((await as(giver).post('/donations/checkout', { amountCents: 1000, idempotencyKey: 'chk-00001' })).statusCode).toBe(503);
    // A fresh session id each run, since gifts stay in the test database.
    const sessionId = `cs_test_${Date.now()}`;
    let sent: { url: string; body: string } | null = null;
    const fakeStripe = async (url: string, init: { body: string }) => {
      sent = { url, body: init.body };
      return { ok: true, status: 200, json: async () => ({ id: sessionId, url: `https://checkout.stripe.com/c/pay/${sessionId}` }) };
    };
    const out = await donations.checkout(db, keys, giver, { amountCents: 1000, target: { kind: 'everyone' }, showDonor: false, idempotencyKey: 'chk-00002' }, { success: 'https://x/give?thanks=1', cancel: 'https://x/give' }, fakeStripe);
    expect(out.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(sent!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(new URLSearchParams(sent!.body).get('payment_method_types[0]')).toBe('us_bank_account');

    const hooked = buildApp({ db, verifyToken: async () => 'nobody', stripe: keys });
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: sessionId, payment_status: 'paid', payment_intent: `pi_${sessionId}`, metadata: { donation_id: out.donationId } } } });
    const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', keys.webhookSecret).update(`${t}.${body}`).digest('hex')}`;
    const post = (sig: string) => hooked.inject({ method: 'POST', url: '/donations/stripe-webhook', headers: { 'content-type': 'application/json', 'stripe-signature': sig }, payload: event });
    expect((await post('t=1,v1=bad')).statusCode).toBe(400);
    expect((await post(sign(event, 1))).statusCode).toBe(400); // too old
    expect((await post(sign(event))).statusCode).toBe(200);
    expect((await post(sign(event))).statusCode).toBe(200); // a retry pays nothing twice
    expect(await tokens.balanceOf(db, giver)).toBe(100);
    expect((await as(giver).get('/me/donations')).json().donations[0]).toMatchObject({ amount_cents: 1000, status: 'paid' });

    // Refunded from the Stripe Dashboard: the giver's thank-you tokens go back, once.
    const refunded = JSON.stringify({ type: 'charge.refunded', data: { object: { id: 'ch_1', refunded: true, payment_intent: `pi_${sessionId}` } } });
    const postRefund = () =>
      hooked.inject({ method: 'POST', url: '/donations/stripe-webhook', headers: { 'content-type': 'application/json', 'stripe-signature': sign(refunded) }, payload: refunded });
    expect((await postRefund()).statusCode).toBe(200);
    expect((await postRefund()).statusCode).toBe(200);
    expect(await tokens.balanceOf(db, giver)).toBe(0);
    expect((await as(giver).get('/me/donations')).json().donations[0]).toMatchObject({ status: 'refunded' });
    await hooked.close();
  });

  it('Zeffy: a webhook with the right token records the gift from the API, once, and a refund takes it back', async () => {
    await donations.updateSettings(db, { enabled: true, provider: 'zeffy', donateUrl: 'https://www.zeffy.com/en-US/donation-form/example', regularPerDollar: 10, priestlyPerDollar: 1 });
    const giver = await createUser('Zeffy Zoe');
    const email = (await db.query<{ email: string }>(`select email from auth.users where id = $1`, [giver])).rows[0]!.email;
    const paymentId = `zp_${Date.now()}`;
    const payment: Record<string, unknown> = { id: paymentId, status: 'succeeded', amount: 2000, currency: 'USD', contactId: 'ct_1', refund: null };
    const asked: string[] = [];
    const fakeZeffy: zeffy.Fetch = async (url, init) => {
      asked.push(url);
      expect(init.headers.authorization).toBe('Bearer zeffy_test_key_placeholder');
      if (url.endsWith('/contacts/ct_1')) return { ok: true, status: 200, json: async () => ({ id: 'ct_1', email: email.toUpperCase() }) };
      if (url.includes(`/payments/${paymentId}`)) return { ok: true, status: 200, json: async () => payment };
      if (url.includes('/payments?')) return { ok: true, status: 200, json: async () => ({ data: [payment], has_more: false }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const keys = { apiKey: 'zeffy_test_key_placeholder', webhookToken: 'webhook-token-0123456789abcdef', fetch: fakeZeffy };
    const hooked = buildApp({ db, verifyToken: async () => 'nobody', zeffy: keys });
    // The body is never trusted: a forged amount here changes nothing.
    const body = { type: 'payment.completed', data: { object: { id: paymentId, amount: 999_999 } } };
    const post = (token: string) => hooked.inject({ method: 'POST', url: `/donations/zeffy-webhook?token=${token}`, payload: body });
    expect((await post('wrong-token-0123456789abcdef')).statusCode).toBe(401);
    expect((await post(keys.webhookToken)).json()).toMatchObject({ result: 'recorded' });
    expect((await post(keys.webhookToken)).json()).toMatchObject({ result: 'skipped' }); // a retry records nothing twice
    expect(await tokens.balanceOf(db, giver)).toBe(200); // $20 x 10 regular, matched by email
    expect((await as(giver).get('/me/donations')).json().donations[0]).toMatchObject({ amount_cents: 2000, status: 'paid' });
    // The catch-up sync sees the same payment and skips it.
    expect(await withTx(db, (tx) => zeffy.syncRecent(tx, keys))).toEqual({ recorded: 0, refunded: 0, skipped: 1 });
    expect(asked.some((u) => u.includes('created%5Bgte%5D='))).toBe(true);
    // Refunded in Zeffy: the next sync refunds the gift.
    payment.refund = { amount: 2000 };
    expect(await withTx(db, (tx) => zeffy.syncRecent(tx, keys))).toEqual({ recorded: 0, refunded: 1, skipped: 0 });
    expect(await tokens.balanceOf(db, giver)).toBe(0);
    // Without a token set, the webhook is off.
    const off = buildApp({ db, verifyToken: async () => 'nobody' });
    expect((await off.inject({ method: 'POST', url: '/donations/zeffy-webhook?token=x', payload: body })).statusCode).toBe(503);
    await Promise.all([hooked.close(), off.close()]);
  });

  it('tells the giver, the member given to, and a member whose radio request was decided, in Open Circle words there', async () => {
    await donations.updateSettings(db, { enabled: true, provider: 'zeffy', donateUrl: 'https://www.zeffy.com/en-US/donation-form/example', priestlyPerDollar: 2, regularPerDollar: 10, allocationRequestsEnabled: true });
    const [giver, friend, asker] = [await createUser('Notice Nina'), await createUser('Notice Ned'), await createUser('Notice Asa')];
    const c = await db.connect();
    const notices = async (userId: string) =>
      (await c.query<{ kind: string; title: string; body: string }>('select kind, title, body from public.notifications where user_id = $1 order by created_at', [userId])).rows;
    try {
      await c.query('begin');
      await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
      await c.query('delete from public.community_memberships where user_id = $1', [friend]);
      await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [friend]);
      await donations.record(c, admin, { amountCents: 500, donorId: giver, target: { kind: 'member', userId: friend }, showDonor: false, via: 'zeffy' });
      expect(await notices(giver)).toEqual([expect.objectContaining({ kind: 'gift_received', title: 'Thank you for your gift', body: expect.stringContaining('$5 came through. You earned 50 tokens') })]);
      const [toFriend] = await notices(friend);
      expect(toFriend).toMatchObject({ kind: 'gift_to_you', title: 'Someone gave you Lighthouse tokens' });
      expect(`${toFriend!.title} ${toFriend!.body}`).not.toMatch(/pray|priestly/i);

      const ask = await donations.requestAllocation(c, asker, { count: 2, note: '' });
      await donations.decide(c, admin, ask.id, { grant: 0 });
      expect(await notices(asker)).toEqual([expect.objectContaining({ kind: 'radio_request_decided', body: "Staff couldn't grant more this time." })]);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('marks a bank transfer that never cleared as failed, not refunded', async () => {
    const giver = await createUser('Failed Fay');
    const { rows } = await db.query<{ id: string }>(
      `insert into public.donations (donor_id, amount_cents, provider) values ($1, 2000, 'stripe') returning id`,
      [giver],
    );
    await donations.stripeEvent(db, { type: 'checkout.session.async_payment_failed', data: { object: { metadata: { donation_id: rows[0]!.id } } } });
    expect((await as(giver).get('/me/donations')).json().donations[0]).toMatchObject({ status: 'failed' });
  });

  it('offers PayPal as a second way to give, and records each PayPal gift once', async () => {
    await as(admin).patch('/admin/donation-settings', { enabled: true, provider: 'none', paypalUrl: 'https://www.paypal.com/donate/?hosted_button_id=TEST' });
    const info = (await as(admin).get('/donations/info')).json();
    expect(info).toMatchObject({ enabled: true, provider: 'none', paypalUrl: 'https://www.paypal.com/donate/?hosted_button_id=TEST' });
    expect((await as(admin).patch('/admin/donation-settings', { paypalUrl: 'http://insecure.example' })).statusCode).toBe(400);
    const ref = `PP-${Date.now()}`;
    expect((await as(admin).post('/admin/donations', { amountCents: 2500, via: 'paypal', reference: ref })).statusCode).toBe(201);
    expect((await as(admin).post('/admin/donations', { amountCents: 2500, via: 'paypal', reference: ref })).statusCode).toBe(409);
    await as(admin).patch('/admin/donation-settings', { paypalUrl: null });
  });

  it('lets an admin mark a manual gift refunded, keeping tokens already spent', async () => {
    await donations.updateSettings(db, { enabled: true, regularPerDollar: 10 });
    const giver = await createUser('Manual Mo');
    const gift = (await as(admin).post('/admin/donations', { amountCents: 500, donorId: giver })).json();
    expect(await tokens.balanceOf(db, giver)).toBe(50);
    const res = await as(admin).post(`/admin/donations/${gift.id}/refund`);
    expect(res.statusCode).toBe(200);
    expect(await tokens.balanceOf(db, giver)).toBe(0);
    expect((await as(admin).post(`/admin/donations/${gift.id}/refund`)).statusCode).toBe(404);
    expect((await as(giver).post(`/admin/donations/${gift.id}/refund`)).statusCode).toBe(403);
  });
});
