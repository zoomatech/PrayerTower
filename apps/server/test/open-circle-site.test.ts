import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { defaultLegalDir } from '../src/modules/site/index.js';
import { app, db } from './helpers.js';

afterAll(() => db.end());

// Nothing religious anywhere an Open Circle visitor looks (docs/OPEN_CIRCLE.md).
const RELIGIOUS = /pray|prayer tower|\bgod\b|church|faith|scripture|bible|jesus|christ|pastor|spiritual|bless|ministry|worship/i;
const visible = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
const onHost = (url: string, host = 'opencircle.example') => app.inject({ method: 'GET', url, headers: { host } });

describe('Open Circle website', () => {
  it('serves its own landing, support, privacy and terms pages on its domain, with no religious words', async () => {
    const home = await onHost('/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('Look out for one another.');
    expect(home.body).toContain('<a class="brand" href="/">');
    expect(home.body).toContain('href="/privacy"');
    expect(home.body).toContain('invite-only pilot');

    const support = await onHost('/support');
    expect(support.body).toContain('mailto:help@example.com');
    expect(support.body).toContain('call or text 988');
    expect(support.body).toContain('href="/account-deletion"');

    const privacy = await onHost('/privacy');
    expect(privacy.statusCode).toBe(200);
    expect(privacy.body).toContain('<h1>Open Circle Privacy Policy (DRAFT)</h1>');
    expect(privacy.body).toContain('DRAFT FOR LAWYER REVIEW');
    expect(privacy.body).not.toContain('{{NAME}}');
    expect(privacy.body).not.toContain('Reviewer notes');

    const terms = await onHost('/terms');
    expect(terms.statusCode).toBe(200);
    expect(terms.body).toContain('<h1>Open Circle Terms of Use (DRAFT)</h1>');
    expect(terms.body).not.toContain('Open Circle edition');

    const deletion = await onHost('/account-deletion');
    expect(deletion.body).toContain('Delete your Open Circle account');
    expect(deletion.body).toContain('const BASE = ""');

    for (const page of [home, support, privacy, terms, deletion]) expect(visible(page.body)).not.toMatch(RELIGIOUS);
    // The deletion page's messages (shown after a tap) are neutral too.
    expect(deletion.body).not.toMatch(/God bless/);

    // English only: the /es pages send people to the English page.
    expect((await onHost('/es')).headers.location).toBe('/');
    expect((await onHost('/es/privacy')).headers.location).toBe('/privacy');
  });

  it('keeps the Prayer Tower pages on every other host', async () => {
    const home = await onHost('/', 'prayertower.example');
    expect(home.body).toContain('Pray for one another.');
    expect(home.body).not.toContain('Open Circle');
    expect((await onHost('/account-deletion', 'prayertower.example')).body).toContain('Delete your Prayer Tower account');
  });

  it('is always reachable under /open-circle, with links that stay there', async () => {
    const home = await app.inject({ method: 'GET', url: '/open-circle' });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('Look out for one another.');
    expect(home.body).toContain('href="/open-circle/support"');
    expect(home.body).toContain('href="/open-circle/privacy"');
    expect((await app.inject({ method: 'GET', url: '/open-circle/' })).headers.location).toBe('/open-circle');

    const support = (await app.inject({ method: 'GET', url: '/open-circle/support' })).body;
    expect(support).toContain('href="/open-circle/account-deletion"');
    expect((await app.inject({ method: 'GET', url: '/open-circle/privacy' })).body).toContain('Open Circle Privacy Policy');
    expect((await app.inject({ method: 'GET', url: '/open-circle/terms' })).body).toContain('Open Circle Terms of Use');

    // One level down, so the page's form still posts to /account-deletion/requests and /me.
    const deletion = (await app.inject({ method: 'GET', url: '/open-circle/account-deletion' })).body;
    expect(deletion).toContain('Delete your Open Circle account');
    expect(deletion).toContain('const BASE = "../"');
  });

  it('opens shared links in the Open Circle app on its domain', async () => {
    const id = '6f1c2b0e-8a43-4c1f-9d2e-3b5a7c9d1e2f';
    const page = await onHost(`/post/${id}`);
    expect(page.body).toContain(`href="opencircle://post/${id}"`);
    expect(page.body).toContain('Someone could use your support.');
    expect(visible(page.body)).not.toMatch(RELIGIOUS);
    expect((await onHost(`/post/${id}`, 'prayertower.example')).body).toContain(`href="prayertower://post/${id}"`);
  });

  it('uses the configured name, contact address and store link', async () => {
    const named = buildApp({
      db,
      verifyToken: async () => 'x',
      site: {
        supportEmail: 'help@example.com',
        legalDir: defaultLegalDir(),
        appStoreUrl: null,
        playStoreUrl: null,
        crisisCountry: 'US',
        openCircle: { name: 'Kind Corner', hosts: ['kind.example'], appStoreUrl: 'https://apps.apple.com/app/id2', supportEmail: 'hello@kind.example' },
      },
      deletionPage: { supabaseUrl: 'http://127.0.0.1:54321', publishableKey: null, supportEmail: null },
    });
    const get = (url: string) => named.inject({ method: 'GET', url, headers: { host: 'kind.example' } });
    const home = (await get('/')).body;
    expect(home).toContain('Kind Corner is a small, kind place');
    expect(home).toContain('https://apps.apple.com/app/id2');
    expect(home).not.toContain('Open Circle');
    expect((await get('/support')).body).toContain('mailto:hello@kind.example');
    expect((await get('/privacy')).body).toContain('Kind Corner Privacy Policy (DRAFT)');
    expect((await get('/account-deletion')).body).toContain('Delete your Kind Corner account');
    await named.close();
  });
});
