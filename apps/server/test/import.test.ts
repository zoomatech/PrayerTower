// CSV import for a pilot church: members as invite codes, starter requests.
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { grantRole } from '../src/modules/accounts/index.js';
import type { Mail } from '../src/modules/digest/mailer.js';
import { parseCsv } from '../src/modules/invites/import.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

const sent: Mail[] = [];
const mailApp = buildApp({ db, verifyToken: async (t) => t.slice(5), mailer: async (m) => void sent.push(m) });

describe('CSV import', () => {
  it('parses quoted fields, commas, line breaks inside quotes, CRLF, a BOM and semicolons', () => {
    expect(parseCsv('﻿email,name\r\n"a@x.org","Doe, Ann"\r\nb@x.org,"Say ""hi""\nthere"\n')).toEqual([
      ['email', 'name'],
      ['a@x.org', 'Doe, Ann'],
      ['b@x.org', 'Say "hi"\nthere'],
    ]);
    expect(parseCsv('correo;nombre\nc@x.org;Carla')).toEqual([['correo', 'nombre'], ['c@x.org', 'Carla']]);
  });

  it('previews then imports members as single-use invite codes, skipping members and repeats', async () => {
    const admin = await createUser('Import Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Import Member');
    const existing = `${member}@test.local`;
    const tag = randomUUID().slice(0, 8);
    const csv = `Email,Name,Language\nana-${tag}@example.org,Ana,es\nbo-${tag}@example.org,Bo,\n${existing},Already,\nnot-an-email,Bad,\nANA-${tag}@example.org,Ana again,`;

    expect((await as(member).post('/admin/import', { kind: 'members', csv })).statusCode).toBe(403);
    const preview = (await as(admin).post('/admin/import', { kind: 'members', csv })).json();
    expect(preview.dryRun).toBe(true);
    expect(preview.rows.map((r: { status: string }) => r.status)).toEqual(['ok', 'ok', 'skipped', 'error', 'skipped']);
    expect(preview.rows[2].reason).toBe('Already a member');
    expect((await db.query(`select 1 from public.invite_codes where note like $1`, [`%${tag}%`])).rows).toHaveLength(0);

    const r = await as(admin).post('/admin/import', { kind: 'members', csv, dryRun: false, note: `Grace ${tag}` });
    expect(r.statusCode, r.body).toBe(200);
    const done = r.json();
    expect(done.counts).toMatchObject({ invited: 2, skipped: 2, error: 1 });
    const { rows } = await db.query<{ note: string; max_uses: number }>(`select note, max_uses from public.invite_codes where code = any($1)`, [
      done.rows.filter((x: { code?: string }) => x.code).map((x: { code: string }) => x.code),
    ]);
    expect(rows.map((x) => x.note).sort()).toEqual([`Grace ${tag}: Ana`, `Grace ${tag}: Bo`]);
    expect(rows.every((x) => x.max_uses === 1)).toBe(true);
  });

  it('emails each new member their code in their language when asked', async () => {
    const admin = await createUser('Mail Import Admin');
    await grantRole(db, admin, 'admin', null);
    const tag = randomUUID().slice(0, 8);
    const r = await mailApp.inject({
      method: 'POST',
      url: '/admin/import',
      headers: { authorization: `Bearer test:${admin}` },
      payload: { kind: 'members', csv: `correo;nombre;idioma\nluz-${tag}@example.org;Luz;español`, dryRun: false, sendEmails: true },
    });
    expect(r.json().rows[0]).toMatchObject({ status: 'emailed', email: `luz-${tag}@example.org` });
    const mail = sent.find((m) => m.to === `luz-${tag}@example.org`)!;
    expect(mail.html).toContain('lang="es"');
    expect(mail.text).toContain(r.json().rows[0].code);
  });

  it('posts starter prayer requests as the admin, refusing empty and repeated rows', async () => {
    const admin = await createUser('Request Import Admin');
    await grantRole(db, admin, 'admin', null);
    const tag = randomUUID().slice(0, 8);
    const csv = `request,anonymous\n"Pray for our new building, ${tag}",no\nPray for the youth retreat ${tag},yes\n,yes\n\nPray for the youth retreat ${tag},`;
    const preview = (await as(admin).post('/admin/import', { kind: 'requests', csv })).json();
    expect(preview.rows.map((x: { status: string; line: number }) => [x.line, x.status])).toEqual([[2, 'ok'], [3, 'ok'], [4, 'error'], [6, 'skipped']]);
    const done = (await as(admin).post('/admin/import', { kind: 'requests', csv, dryRun: false })).json();
    expect(done.counts.posted).toBe(2);
    const { rows } = await db.query<{ body: string; is_anonymous: boolean; user_id: string }>(
      `select body, is_anonymous, user_id from public.posts where body like $1 order by body`,
      [`%${tag}%`],
    );
    expect(rows).toEqual([
      { body: `Pray for our new building, ${tag}`, is_anonymous: false, user_id: admin },
      { body: `Pray for the youth retreat ${tag}`, is_anonymous: true, user_id: admin },
    ]);
  });

  it('explains a file without the needed column', async () => {
    const admin = await createUser('Header Admin');
    await grantRole(db, admin, 'admin', null);
    const r = (await as(admin).post('/admin/import', { kind: 'members', csv: 'first,last\nA,B' })).json();
    expect(r.error).toBe('The first row needs a column named "email".');
  });
});
