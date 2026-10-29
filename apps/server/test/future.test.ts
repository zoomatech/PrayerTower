import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { app, as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.future_settings set purchases_enabled = false, common_fund_page_enabled = false, ai_chat_enabled = false');
  await db.end();
});

describe('switched-off groundwork for blocked features', () => {
  it('keeps token purchase, the fund page and the AI conversation off by default', async () => {
    const member = await createUser('Future Member');
    expect((await as(member).get('/token-store')).json()).toEqual({ enabled: false, products: [], practice: false });
    const buy = await as(member).post('/token-store/purchases', { platform: 'ios', signedTransaction: 'eyJhbGciOiJFUzI1NiJ9.e30.x' });
    expect(buy.statusCode).toBe(403);
    expect((await as(member).get('/common-prayer-fund')).json()).toEqual({ enabled: false });
    expect((await app.inject({ method: 'GET', url: '/common-prayer-fund/report' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/fund' })).statusCode).toBe(404);
    expect((await as(member).get('/ai-chat')).json().enabled).toBe(false);
    expect((await as(member).post('/ai-chat', { message: 'Hello' })).statusCode).toBe(403);
  });

  it('never credits tokens from a purchase while the App Store connection is not set up, and always shows the not-God warning', async () => {
    const admin = await createUser('Future Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Future Buyer');
    expect((await as(member).patch('/admin/future-settings', { purchasesEnabled: true })).statusCode).toBe(403);
    await as(admin).patch('/admin/future-settings', { purchasesEnabled: true, commonFundPageEnabled: true, aiChatEnabled: true });
    // No Apple root certificate configured here, so nothing can be verified or credited.
    expect((await as(member).post('/token-store/purchases', { platform: 'ios', signedTransaction: 'eyJhbGciOiJFUzI1NiJ9.e30.x' })).statusCode).toBe(503);
    const fund = (await as(member).get('/common-prayer-fund')).json();
    expect(fund).toMatchObject({ enabled: true, percent: 10, totals: { inCents: expect.any(Number) } });
    expect((await app.inject({ method: 'GET', url: '/common-prayer-fund/report' })).json()).toMatchObject({ enabled: true });
    const page = await app.inject({ method: 'GET', url: '/fund' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Common Prayer Fund');
    const chat = (await as(member).post('/ai-chat', { message: 'Are you God?' })).json();
    expect(chat.warning).toMatch(/It is not God/);
    await as(admin).patch('/admin/future-settings', { purchasesEnabled: false, commonFundPageEnabled: false, aiChatEnabled: false });
  });
});
