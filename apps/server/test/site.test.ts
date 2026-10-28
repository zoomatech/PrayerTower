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
});
