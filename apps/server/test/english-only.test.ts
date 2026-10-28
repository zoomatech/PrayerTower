// Members see English only (Steve, 2026-10-28): with SPANISH_ENABLED unset, a
// member whose saved language is Spanish still gets English everywhere.
import { afterAll, describe, expect, it } from 'vitest';
import { languages } from '../src/language.js';
import { toHtml } from '../src/modules/admin/sponsor-report.js';
import { renderDigest } from '../src/modules/digest/index.js';
import { renderInviteEmail } from '../src/modules/invites/email.js';
import { localize } from '../src/modules/notifications/i18n.js';
import { question } from '../src/modules/prompts/index.js';
import { app, as, createUser, db, drainJobs, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('English only', () => {
  it('is the default', () => {
    expect(languages.spanish).toBe(false);
  });

  it('sends notifications and prompts in English to a member who chose Spanish', async () => {
    const poster = await createUser('Lucía');
    const member = await createUser('Pedro');
    await as(poster).patch('/me', { locale: 'es' });
    const post = await newRequest(poster);
    await as(member).post(`/posts/${post.id}/praying-now`, {});
    await drainJobs();
    const notes = (await as(poster).get('/me/notifications')).json().notifications as { kind: string; title: string }[];
    expect(notes.find((n) => n.kind === 'praying_now')!.title).toBe('Pedro is praying for you, Lucía, right now');
    expect(localize('es', 'praying_now', { who: 'Ana' })).toBeNull();
    expect(question('gentle', 'Billy', true, 'es')).not.toMatch(/oraste/);
  });

  it('writes every email in English', () => {
    const invite = renderInviteEmail({ to: 'a@example.com', code: 'ABC', lang: 'es', from: 'Steve', links: { webAppUrl: null, appStoreUrl: null, playStoreUrl: null } });
    expect(invite.subject).not.toMatch(/invit[oó] a|te invita/i);
    expect(invite.html).not.toContain('lang="es"');
    const digest = renderDigest({ name: 'Ana', prayed: 1, prayedFor: 1, kept: 0, promised: 0, answered: [] } as never, 'es', 'a@example.com');
    expect(digest.html).toContain('lang="en"');
    expect(toHtml([], 'es')).toContain('lang="en"');
  });

  it('serves the website in English, with no Spanish link, and sends /es visitors to the English page', async () => {
    const home = await app.inject({ method: 'GET', url: '/' });
    expect(home.body).not.toContain('Español');
    expect(home.body).not.toContain('hreflang="es"');
    for (const [from, to] of [['/es', '/'], ['/es/', '/'], ['/es/support', '/support'], ['/es/privacy', '/privacy'], ['/es/terms', '/terms'], ['/es/account-deletion', '/account-deletion']]) {
      const res = await app.inject({ method: 'GET', url: from! });
      expect(res.statusCode, from).toBe(302);
      expect(res.headers.location, from).toBe(to);
    }
    expect((await app.inject({ method: 'GET', url: '/account-deletion' })).body).not.toContain('Español');
  });
});
