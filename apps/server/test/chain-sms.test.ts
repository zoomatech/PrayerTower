// Prayer chain by text message: a number is asked once, gets requests only after saying
// yes on the web, and leaves for good when it replies STOP.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as growth from '../src/modules/growth/index.js';
import { createSms, type SmsSend } from '../src/modules/growth/sms.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

const texts: { to: string; body: string }[] = [];
let optOut = false;
const sms: SmsSend = async (to, body) => {
  texts.push({ to, body });
  return { ok: !optOut, optedOut: optOut };
};
const ctx: growth.MailContext = { mailer: async () => undefined, siteUrl: 'https://api.example.org', openCircleName: 'Open Circle', sms };
const form = (url: string, body: Record<string, string>) =>
  app.inject({ method: 'POST', url, remoteAddress: '203.0.113.9', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(body).toString() });
let admin: string;

beforeEach(async () => {
  texts.length = 0;
  optOut = false;
  admin ??= await createUser('Sms Admin');
  await grantRole(db, admin, 'admin', null);
  await as(admin).patch('/admin/growth-settings', { guestPrayerEnabled: true, prayerChainEnabled: true, prayerChainSmsEnabled: true });
});

afterAll(async () => {
  await growth.updateSettings(db, { guestPrayerEnabled: false, prayerChainEnabled: false, prayerChainSmsEnabled: false });
  await db.end();
});

describe('prayer chain by text', () => {
  it('refuses numbers while texts are off, and odd numbers always', async () => {
    const owner = await createUser('Sms Off');
    await as(admin).patch('/admin/growth-settings', { prayerChainSmsEnabled: false });
    expect((await as(owner).get('/features')).json().features.prayerChainSms).toBe(false);
    expect((await as(owner).post('/me/prayer-chain', { phone: '+1 505 555 0100' })).statusCode).toBe(403);
    await as(admin).patch('/admin/growth-settings', { prayerChainSmsEnabled: true });
    expect((await as(owner).post('/me/prayer-chain', { phone: '505-555-0100' })).statusCode).toBe(400);
  });

  it('asks once, sends after yes, and stops on STOP', async () => {
    const owner = await createUser('Ruth Texter');
    const post = await newRequest(owner, 'Pray for my brother, surgery Friday morning.');
    const added = await as(owner).post('/me/prayer-chain', { phone: '+1 (505) 555-0101' });
    expect(added.statusCode).toBe(201);
    expect((await as(owner).post('/me/prayer-chain', { phone: '+15055550101' })).statusCode).toBe(409);
    expect((await as(owner).get('/me/prayer-chain')).json().people[0]).toMatchObject({ phone: '+15055550101', email: null, status: 'pending' });

    await growth.chainConfirmTask(db, ctx)({ memberId: added.json().id }, {} as never);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.to).toBe('+15055550101');
    expect(texts[0]!.body).toContain('Ruth would like to add you to their prayer chain by text');
    expect(texts[0]!.body).toContain('Reply STOP');
    const token = (await db.query('select token from public.prayer_chain_members where id = $1', [added.json().id])).rows[0].token as string;
    const page = await app.inject({ method: 'GET', url: `/chain/${token}` });
    expect(page.body).toContain('by text message');
    await form(`/chain/${token}`, { join: 'yes' });

    texts.length = 0;
    await as(owner).post(`/posts/${post.id}/prayer-chain`);
    await growth.chainSendTask(db, ctx)({ postId: post.id }, {} as never);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.body).toContain('Ruth asks for your prayers: "Pray for my brother');
    expect(texts[0]!.body).toContain('https://api.example.org/pray/');
    expect(texts[0]!.body).toContain(`https://api.example.org/chain/${token}`);

    // They replied STOP: Twilio refuses, and they leave the chain.
    optOut = true;
    const post2 = await newRequest(owner, 'And for the drive home afterward.');
    await as(owner).post(`/posts/${post2.id}/prayer-chain`);
    await growth.chainSendTask(db, ctx)({ postId: post2.id }, {} as never);
    expect((await as(owner).get('/me/prayer-chain')).json().people[0].status).toBe('left');
  });

  it('sends no texts without a provider', async () => {
    const owner = await createUser('No Provider');
    const added = await as(owner).post('/me/prayer-chain', { phone: '+447700900123' });
    await growth.chainConfirmTask(db, { ...ctx, sms: null })({ memberId: added.json().id }, {} as never);
    expect(texts).toHaveLength(0);
  });

  it('talks to Twilio with basic auth and reads opt-outs', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (status: number, body: object) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify(body), { status });
      }) as unknown as typeof fetch;
    const keys = { accountSid: `AC${'a'.repeat(32)}`, authToken: 'secret', from: '+15005550006' };
    expect(await createSms(keys, fake(201, { sid: 'SM1' }))('+15055550199', 'Hello')).toEqual({ ok: true, optedOut: false });
    expect(calls[0]!.url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${keys.accountSid}/Messages.json`);
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${keys.accountSid}:secret`).toString('base64')}`);
    expect(String(calls[0]!.init.body)).toBe('To=%2B15055550199&Body=Hello&From=%2B15005550006');
    expect(await createSms(keys, fake(400, { code: 21610 }))('+15055550199', 'Hello')).toEqual({ ok: false, optedOut: true });
    expect(await createSms({ ...keys, from: `MG${'b'.repeat(32)}` }, fake(201, {}))('+15055550199', 'Hi')).toEqual({ ok: true, optedOut: false });
    expect(String(calls[2]!.init.body)).toContain('MessagingServiceSid=MG');
  });
});
