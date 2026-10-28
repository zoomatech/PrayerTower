import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { legalDoc } from '../src/modules/site/index.js';
import { app, db } from './helpers.js';

afterAll(() => db.end());

describe('public website', () => {
  it('serves the landing, support, privacy and terms pages without a sign-in', async () => {
    const home = await app.inject({ method: 'GET', url: '/' });
    expect(home.statusCode).toBe(200);
    expect(home.headers['content-type']).toContain('text/html');
    expect(home.body).toContain('Pray for one another.');
    expect(home.body).toContain('invite-only pilot');

    const support = await app.inject({ method: 'GET', url: '/support' });
    expect(support.body).toContain('mailto:help@example.com');
    expect(support.body).toContain('call or text 988');
    expect(support.body).toContain('href="/account-deletion"');

    const privacy = await app.inject({ method: 'GET', url: '/privacy' });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.body).toContain('<h1>Prayer Tower Privacy Policy (DRAFT)</h1>');
    expect(privacy.body).toContain('DRAFT FOR LAWYER REVIEW');
    expect(privacy.body).not.toContain('Reviewer notes');

    const terms = await app.inject({ method: 'GET', url: '/terms' });
    expect(terms.body).toContain('Terms of Use');
    expect(terms.body).not.toContain('Questions for counsel');
  });

  it('serves every page in Spanish under /es, with the draft warnings kept', async () => {
    const home = await app.inject({ method: 'GET', url: '/es' });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('<html lang="es">');
    expect(home.body).toContain('Oren unos por otros.');
    expect(home.body).toContain('href="/es/privacy"');
    expect(home.body).toContain('<a href="/" hreflang="en" lang="en">English</a>');
    expect((await app.inject({ method: 'GET', url: '/' })).body).toContain('<a href="/es" hreflang="es" lang="es">Español</a>');
    expect((await app.inject({ method: 'GET', url: '/es/' })).headers.location).toBe('/es');

    const support = (await app.inject({ method: 'GET', url: '/es/support' })).body;
    expect(support).toContain('llama o envía un mensaje de texto al 988');
    expect(support).toContain('mailto:help@example.com');
    expect(support).toContain('href="/es/account-deletion"');

    const privacy = (await app.inject({ method: 'GET', url: '/es/privacy' })).body;
    expect(privacy).toContain('Política de privacidad de Prayer Tower (BORRADOR)');
    expect(privacy).toContain('NO PUBLICAR HASTA QUE SE REVISE');
    expect(privacy).not.toContain('Notas para la revisión');
    const terms = (await app.inject({ method: 'GET', url: '/es/terms' })).body;
    expect(terms).toContain('Términos de uso de Prayer Tower (BORRADOR)');
    expect(terms).toContain('BORRADOR PARA REVISIÓN');

    const deletion = await app.inject({ method: 'GET', url: '/es/account-deletion' });
    expect(deletion.statusCode).toBe(200);
    expect(deletion.body).toContain('Eliminar tu cuenta de Prayer Tower');
    expect(deletion.body).toContain('const BASE = "../"');
    expect((await app.inject({ method: 'GET', url: '/account-deletion' })).body).toContain('const BASE = ""');
  });

  it('never shows a Spanish draft over a reviewed English policy', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'legal-es-'));
    writeFileSync(path.join(dir, 'PRIVACY_POLICY.md'), '# Final policy\n');
    writeFileSync(path.join(dir, 'PRIVACY_POLICY_DRAFT.es.md'), '# Borrador\n');
    expect(legalDoc(dir, 'PRIVACY_POLICY', 'es')).toEqual({ html: '<h1>Final policy</h1>\n', draft: false, english: true });
    writeFileSync(path.join(dir, 'PRIVACY_POLICY.es.md'), '# Política final\n');
    expect(legalDoc(dir, 'PRIVACY_POLICY', 'es')).toEqual({ html: '<h1>Política final</h1>\n', draft: false });
    writeFileSync(path.join(dir, 'TERMS_OF_USE_DRAFT.md'), '# Draft terms\n');
    expect(legalDoc(dir, 'TERMS_OF_USE', 'es')).toEqual({ html: '<h1>Draft terms</h1>\n', draft: true, english: true });
  });

  it('prefers the reviewed policy over the draft, and shows store links once listed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'legal-'));
    writeFileSync(path.join(dir, 'PRIVACY_POLICY_DRAFT.md'), '# Draft\n');
    writeFileSync(path.join(dir, 'PRIVACY_POLICY.md'), '# Final policy\n\nIn effect.\n\n---\n\n## Reviewer notes (remove before publishing)\nsecret\n');
    expect(legalDoc(dir, 'PRIVACY_POLICY')).toEqual({ html: '<h1>Final policy</h1>\n<p>In effect.</p>\n', draft: false });
    expect(legalDoc(dir, 'TERMS_OF_USE')).toBeNull();

    const listed = buildApp({
      db,
      verifyToken: async () => 'x',
      site: { supportEmail: null, legalDir: dir, appStoreUrl: 'https://apps.apple.com/app/id1', playStoreUrl: null, crisisCountry: 'CA' },
    });
    expect((await listed.inject({ method: 'GET', url: '/' })).body).toContain('https://apps.apple.com/app/id1');
    expect((await listed.inject({ method: 'GET', url: '/terms' })).statusCode).toBe(404);
    const support = (await listed.inject({ method: 'GET', url: '/support' })).body;
    expect(support).toContain('call or text 9-8-8');
    expect(support).toContain('Send feedback');
    await listed.close();
  });

  it('verifies shared links for both apps and gives people without the app a way in', async () => {
    const linked = buildApp({
      db,
      verifyToken: async () => 'x',
      site: {
        supportEmail: null,
        legalDir: null,
        appStoreUrl: null,
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.zoomatech.prayertower',
        crisisCountry: 'US',
        appLinks: { appleAppIds: ['ABCDE12345.com.zoomatech.prayertower'], androidPackages: ['com.zoomatech.prayertower'], androidFingerprints: ['14:6D:E9'] },
      },
    });
    const aasa = await linked.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' });
    expect(aasa.headers['content-type']).toContain('application/json');
    expect(aasa.json().applinks.details).toEqual([
      { appIDs: ['ABCDE12345.com.zoomatech.prayertower'], components: [{ '/': '/post/*' }] },
      { appID: 'ABCDE12345.com.zoomatech.prayertower', paths: ['/post/*'] },
    ]);
    const assets = await linked.inject({ method: 'GET', url: '/.well-known/assetlinks.json' });
    expect(assets.json()).toEqual([
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.zoomatech.prayertower', sha256_cert_fingerprints: ['14:6D:E9'] } },
    ]);

    const id = '6f1c2b0e-8a43-4c1f-9d2e-3b5a7c9d1e2f';
    const page = await linked.inject({ method: 'GET', url: `/post/${id}?comment=${id}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain(`href="prayertower://post/${id}?comment=${id}"`);
    expect(page.body).toContain('Get it on Google Play');
    expect((await linked.inject({ method: 'GET', url: '/post/%3Cscript%3E' })).statusCode).toBe(404);
    await linked.close();

    // Not configured: no verification files.
    expect((await app.inject({ method: 'GET', url: '/.well-known/apple-app-site-association' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/.well-known/assetlinks.json' })).statusCode).toBe(404);
  });
});
