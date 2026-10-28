// The "don't pressure people" rule and the ad-free promise page, both off by default.
// The switches are one shared row, so the "on" cases run in a transaction that is rolled back.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as moderation from '../src/modules/moderation/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import { brand } from '../src/modules/site/open-circle.js';
import { promisePage } from '../src/modules/site/promise.js';
import { app, as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

const RELIGIOUS = /pray|prayer tower|\bgod\b|church|faith|scripture|bible|jesus|christ|pastor|spiritual|bless|ministry|worship/i;

describe("Don't pressure people rule", () => {
  it('is off by default, and moderators can cite it once an admin turns it on', async () => {
    const [poster, reporter, mod] = [await createUser('Pusher'), await createUser('Pushed'), await createUser('Pressure Mod')];
    await grantRole(db, mod, 'moderator', null);
    expect((await as(poster).get('/features')).json().features.pressureRule).toBe(false);
    const post = await newRequest(poster, 'Your church is false, come to mine instead.');
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: 'Pressure' });
    const item = (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string;
    expect((await as(mod).post(`/moderation/items/${item}/decision`, { action: 'remove', rule: 'pressure' })).statusCode).toBe(400);

    const c = await db.connect();
    try {
      await c.query('begin');
      await notebook.updateSettings(c, { pressureRuleEnabled: true });
      expect((await notebook.features(c)).pressureRule).toBe(true);
      await moderation.decide(c, mod, item, { action: 'remove', rule: 'pressure', clawbackTransferIds: [] });
      const { rows } = await c.query<{ body: string }>(`select body from public.notifications where user_id = $1 and kind = 'moderation_notice'`, [poster]);
      expect(rows[0]!.body).toContain("Share your beliefs freely. Don't pressure people.");
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});

describe('Ad-free promise page', () => {
  it('is not served while switched off', async () => {
    expect((await app.inject({ method: 'GET', url: '/promise' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/open-circle/promise' })).statusCode).toBe(404);
  });

  it('promises no ads, no selling and no ad tracking, in each edition’s words', () => {
    const pt = promisePage('Prayer Tower');
    expect(pt).toContain('<h1>Our promise to you</h1>');
    expect(pt).toContain('No ads. Ever.');
    expect(pt).toContain('We never sell your information.');
    expect(pt).toContain('pray for one another');
    const oc = promisePage('Open Circle', brand({ name: 'Open Circle', hosts: [], appStoreUrl: null, supportEmail: null }, '/open-circle'));
    expect(oc).toContain('No ad tracking.');
    expect(oc).toContain('href="/open-circle/support"');
    expect(oc.slice(oc.indexOf('<body'))).not.toMatch(RELIGIOUS);
  });
});
