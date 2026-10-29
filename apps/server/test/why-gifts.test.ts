// Why we run on gifts, not ads: the /why-donations pages and the app's JSON, off by
// default, in each edition's words, with a Give link only while giving is on through Zeffy.
import { afterAll, describe, expect, it } from 'vitest';
import { app, as, createUser, db } from './helpers.js';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church\w*|amen|blessed|scripture|believers|acts \d)/i;
const setOn = (on: boolean) => db.query('update public.notebook_settings set why_gifts_enabled = $1', [on]);

afterAll(async () => {
  await setOn(false);
  await db.end();
});

describe('Why gifts, not ads', () => {
  it('is off by default', async () => {
    for (const url of ['/why-donations', '/open-circle/why-donations', '/why-gifts']) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
  });

  it('gives each edition its own words, and no give button without a donation link', async () => {
    await setOn(true);
    const pt = await app.inject({ method: 'GET', url: '/why-donations' });
    expect(pt.statusCode).toBe(200);
    expect(pt.body).toContain('How we pay for it: gifts, not ads');
    expect(pt.body).toContain('Acts 2:45');
    expect(pt.body).not.toContain('class="button"');

    const oc = await app.inject({ method: 'GET', url: '/open-circle/why-donations' });
    expect(oc.statusCode).toBe(200);
    expect(oc.body).toContain('Open Circle runs on gifts');
    const text = oc.body.replace(/<[^>]+>/g, ' ');
    expect(text.match(RELIGIOUS)).toBeNull();
    expect((await app.inject({ method: 'GET', url: '/why-donations', headers: { host: 'opencircle.example' } })).body).toContain('Open Circle runs on gifts');
  });

  it('links the Zeffy page while giving is on through Zeffy', async () => {
    await setOn(true);
    await db.query("update public.donation_settings set enabled = true, provider = 'zeffy', donate_url = 'https://www.zeffy.com/en-US/donation-form/prayer-tower'");
    try {
      const pt = await app.inject({ method: 'GET', url: '/why-donations' });
      expect(pt.body).toContain('<a class="button" href="https://www.zeffy.com/en-US/donation-form/prayer-tower">Give</a>');
    } finally {
      await db.query("update public.donation_settings set enabled = false, provider = 'none', donate_url = null");
    }
  });

  it('sends the app the same words for the member’s wording', async () => {
    await setOn(true);
    const member = await createUser('Gift Reader');
    const faith = (await as(member).get('/why-gifts?wording=faith')).json();
    expect(faith.points).toHaveLength(7);
    expect(faith.points[0].heading).toBe('Ads would make you the product.');
    expect(faith.giveUrl).toBeNull();
    const neutral = (await as(member).get('/why-gifts?wording=neutral')).json();
    expect(neutral.intro).toBe('Open Circle runs on gifts from the people who use it and believe in it. Here is why.');
    expect(neutral.fundPath).toBeNull();
    expect(JSON.stringify(neutral).match(RELIGIOUS)).toBeNull();
    expect((await as(member).get('/why-gifts?wording=other')).statusCode).toBe(400);
  });
});
