// Emails in the recipient's language: invite emails, the sponsor report and
// a new member's starting language (from sign-up).
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { grantRole } from '../src/modules/accounts/index.js';
import { recipientLangs, weeklySponsorReportTask } from '../src/modules/admin/sponsor-report.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import { renderInviteEmail } from '../src/modules/invites/email.js';
import { app as noMailApp, createUser, db } from './helpers.js';
import { languages } from '../src/language.js';

// These tests check the Spanish text, which members see only with SPANISH_ENABLED=1.
languages.spanish = true;

afterAll(() => db.end());

const sent: Mail[] = [];
const app = buildApp({
  db,
  verifyToken: async (token) => token.slice(5),
  mailer: async (m) => void sent.push(m),
  webAppUrl: 'https://app.example.org/',
});
const post = (a: typeof app, user: string, url: string, payload: object) =>
  a.inject({ method: 'POST', url, headers: { authorization: `Bearer test:${user}` }, payload });

describe('emails in the member’s language', () => {
  it('sets a new member’s language from the sign-up metadata', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const meta = [{ locale: 'es' }, { locale: 'en' }, { locale: 'fr' }];
    for (const [i, id] of ids.entries())
      await db.query(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`, [
        id,
        `${id}@test.local`,
        { display_name: 'Lang', ...meta[i] },
      ]);
    const { rows } = await db.query<{ id: string; locale: string }>('select id, locale from public.profiles where id = any($1::uuid[])', [ids]);
    expect(ids.map((id) => rows.find((r) => r.id === id)?.locale)).toEqual(['es', 'en', 'en']);
  });

  it('renders the invite email in Spanish with the sign-up link and escapes the note', () => {
    const m = renderInviteEmail({
      to: 'ana@example.org',
      code: 'ABCD2345',
      lang: 'es',
      from: 'Pastora Ruth',
      message: 'Ven <b>pronto</b>',
      links: { webAppUrl: 'https://app.example.org/', appStoreUrl: null, playStoreUrl: null },
    });
    expect(m.subject).toMatch(/Prayer Tower/);
    expect(m.text).toContain('ABCD2345');
    expect(m.text).toContain('https://app.example.org/sign-in?invite=ABCD2345');
    expect(m.text).toMatch(/Pastora Ruth/);
    expect(m.html).toContain('lang="es"');
    expect(m.html).not.toContain('<b>pronto</b>');
    expect(renderInviteEmail({ ...m, to: m.to, code: 'X', lang: 'en', from: 'A', links: { webAppUrl: null, appStoreUrl: null, playStoreUrl: null } }).html).toContain('lang="en"');
  });

  it('tells iPhone users how to join the TestFlight pilot, with each edition\'s own link', () => {
    const links = { webAppUrl: null, appStoreUrl: null, playStoreUrl: null, testFlightUrl: 'https://testflight.apple.com/join/PRAY1234', openCircleTestFlightUrl: 'https://testflight.apple.com/join/OPEN5678' };
    const pt = renderInviteEmail({ to: 'a@example.org', code: 'ABCD2345', lang: 'en', from: 'Steve', links });
    expect(pt.text).toContain("install Apple's free TestFlight app from the App Store, then open: https://testflight.apple.com/join/PRAY1234");
    expect(pt.html).toContain('href="https://testflight.apple.com/join/PRAY1234"');
    const oc = renderInviteEmail({ to: 'a@example.org', code: 'ABCD2345', lang: 'en', from: 'Steve', links, community: { name: 'Open Circle', secular: true } });
    expect(oc.text).toContain('https://testflight.apple.com/join/OPEN5678');
    expect(oc.text).not.toContain('PRAY1234');
    expect(renderInviteEmail({ to: 'a@example.org', code: 'X', lang: 'en', from: 'Steve', links: { ...links, testFlightUrl: null } }).text).not.toContain('TestFlight');
  });

  it('lets admins email an active invite code, in the admin’s language by default', async () => {
    const admin = await createUser('Mail Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Mail Member');
    const [invite] = (await post(app, admin, '/admin/invites', { count: 1 })).json().invites;

    expect((await post(app, member, `/admin/invites/${invite.code}/email`, { email: 'x@example.org' })).statusCode).toBe(403);
    expect((await post(app, admin, `/admin/invites/NOSUCHCODE/email`, { email: 'x@example.org' })).statusCode).toBe(404);
    expect((await post(app, admin, `/admin/invites/${invite.code}/email`, { email: 'not an email' })).statusCode).toBe(400);

    await db.query(`update public.profiles set locale = 'es' where id = $1`, [admin]);
    const r = await post(app, admin, `/admin/invites/${invite.code}/email`, { email: 'ana@example.org', message: 'Te esperamos' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ sent: true, language: 'es' });
    const mail = sent.at(-1)!;
    expect(mail.to).toBe('ana@example.org');
    expect(mail.text).toContain(invite.code);
    expect(mail.text).toContain('Te esperamos');
    expect(mail.html).toContain('lang="es"');

    const en = await post(app, admin, `/admin/invites/${invite.code}/email`, { email: 'bo@example.org', language: 'en' });
    expect(en.json()).toEqual({ sent: true, language: 'en' });

    await post(app, admin, `/admin/invites/${invite.code}/revoke`, {});
    expect((await post(app, admin, `/admin/invites/${invite.code}/email`, { email: 'x@example.org' })).statusCode).toBe(409);
    // Without SMTP the server says so.
    const [other] = (await post(noMailApp, admin, '/admin/invites', { count: 1 })).json().invites;
    const off = await post(noMailApp, admin, `/admin/invites/${other.code}/email`, { email: 'x@example.org' });
    expect(off.statusCode).toBe(503);
    expect(off.json().error).toBe('email_off');
  });

  it('sends the sponsor report in each recipient’s language', async () => {
    const member = await createUser('Sponsor Member');
    await db.query(`update public.profiles set locale = 'es' where id = $1`, [member]);
    const email = `${member}@test.local`;
    expect(await recipientLangs(db, [email.toUpperCase(), 'es:outside@example.org', 'board@example.org'], 'en')).toEqual([
      { to: email.toUpperCase(), lang: 'es' },
      { to: 'outside@example.org', lang: 'es' },
      { to: 'board@example.org', lang: 'en' },
    ]);
    const mails: Mail[] = [];
    const logs: string[] = [];
    await weeklySponsorReportTask(db, async (m) => void mails.push(m), [email, 'board@example.org'], 4, 'en')({}, { logger: { info: (s: string) => logs.push(s) } } as never);
    expect(mails.map((m) => m.to)).toEqual([email, 'board@example.org']);
    expect(mails[0]!.subject).toMatch(/semana del/);
    expect(mails[0]!.html).toContain('lang="es"');
    expect(mails[1]!.subject).toMatch(/week of/);
  });
});
