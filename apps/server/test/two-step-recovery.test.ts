// Two-step sign-in, part 2: backup codes for a lost phone, an admin reset, and the
// passkeys switch. All off until an admin turns them on.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { newCode, normalize } from '../src/modules/security/backup-codes.js';
import * as security from '../src/modules/security/index.js';
import { app, as, createUser, db } from './helpers.js';

const defaults = await security.settings(db);
let admin: string;
beforeAll(async () => {
  admin = await createUser('Recovery Admin');
  await grantRole(db, admin, 'admin', null);
});
afterAll(async () => {
  await security.updateSettings(db, {
    twoStepEnabled: defaults.two_step_enabled,
    backupCodesEnabled: defaults.backup_codes_enabled,
    passkeysEnabled: defaults.passkeys_enabled,
  });
  await db.end();
});

const addFactor = (userId: string) =>
  db.query(
    `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
     values ($1, $2, '', 'totp', 'verified', now(), now())`,
    [randomUUID(), userId],
  );
/** A session that entered the authenticator code. */
const aal2 = (userId: string) => ({
  get: (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer test:${userId}:aal2` } }),
  post: (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload, headers: { authorization: `Bearer test:${userId}:aal2` } }),
});
const factors = async (userId: string) => (await db.query('select 1 from auth.mfa_factors where user_id = $1', [userId])).rowCount;

describe('backup codes', () => {
  it('make readable codes and read them forgivingly', () => {
    const code = newCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(normalize(' k4m9-x7qp ')).toBe('K4M9X7QP');
    expect(normalize('O0IL')).toBe('0011');
  });

  it('are off until an admin turns them on, and need two-step sign-in first', async () => {
    const member = await createUser('Codes Off');
    expect((await as(member).get('/me/two-step/backup-codes')).json()).toEqual({ enabled: false });
    expect((await as(member).post('/me/two-step/backup-codes', {})).statusCode).toBe(403);
    expect((await as(member).patch('/admin/security-settings', { backupCodesEnabled: true })).statusCode).toBe(403);
    const on = await as(admin).patch('/admin/security-settings', { backupCodesEnabled: true, passkeysEnabled: true });
    expect(on.json().settings).toMatchObject({ backup_codes_enabled: true, passkeys_enabled: true });
    expect((await as(member).get('/features')).json().features).toMatchObject({ backupCodes: true, passkeys: true });
    expect((await as(member).post('/me/two-step/backup-codes', {})).json().message).toMatch(/two-step sign-in first/);
  });

  it('let a member who lost their phone back in with one code, once', async () => {
    const member = await createUser('Lost Phone Lou');
    await addFactor(member);
    // Without the code, only the backup code route is open.
    expect((await as(member).get('/me')).json().error).toBe('two_step_required');
    expect((await as(member).post('/me/two-step/backup-codes', {})).statusCode).toBe(401);

    const { codes } = (await aal2(member).post('/me/two-step/backup-codes')).json();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect((await aal2(member).get('/me/two-step/backup-codes')).json()).toMatchObject({ enabled: true, remaining: 10 });
    // Only hashes are kept.
    const stored = (await db.query('select code_hash from public.two_step_backup_codes where user_id = $1', [member])).rows;
    expect(stored.map((r) => r.code_hash)).not.toContain(codes[0]);

    const wrong = await as(member).post('/me/two-step/recover', { code: 'AAAA-AAAA' });
    expect(wrong.statusCode).toBe(400);
    expect(await factors(member)).toBe(1);

    const ok = await as(member).post('/me/two-step/recover', { code: codes[3].toLowerCase().replace('-', ' ') });
    expect(ok.json()).toEqual({ ok: true });
    expect(await factors(member)).toBe(0);
    expect((await as(member).get('/me')).statusCode).toBe(200);
    const notice = await db.query(`select title from public.notifications where user_id = $1 and kind = 'account_security'`, [member]);
    expect(notice.rows[0].title).toMatch(/backup code/);
    // Every code is gone with the factor; the same code never works twice.
    expect((await as(member).get('/me/two-step/backup-codes')).json().remaining).toBe(0);
    expect((await as(member).post('/me/two-step/recover', { code: codes[3] })).statusCode).toBe(400);
  });

  it('lock after five wrong codes in an hour', async () => {
    const member = await createUser('Guessing Gus');
    await addFactor(member);
    await aal2(member).post('/me/two-step/backup-codes');
    for (let i = 0; i < 5; i++) expect((await as(member).post('/me/two-step/recover', { code: `ZZZZ-ZZZ${i}` })).statusCode).toBe(400);
    const locked = await as(member).post('/me/two-step/recover', { code: 'ZZZZ-ZZZZ' });
    expect(locked.statusCode).toBe(429);
    expect(await factors(member)).toBe(1);
  });

  it('let an admin turn two-step sign-in off for a member who lost everything', async () => {
    const member = await createUser('Lost Everything Lee');
    await addFactor(member);
    expect((await as(member).post(`/admin/people/${member}/two-step-reset`, {})).statusCode).toBe(401);
    const plain = await createUser('Not An Admin');
    expect((await as(plain).post(`/admin/people/${member}/two-step-reset`, {})).statusCode).toBe(403);
    expect((await as(admin).post(`/admin/people/${member}/two-step-reset`, {})).json()).toEqual({ ok: true });
    expect(await factors(member)).toBe(0);
    const log = await db.query(`select 1 from public.staff_audit_log where action = 'POST /admin/people/:id/two-step-reset' and target_id = $1`, [member]);
    expect(log.rowCount).toBe(1);
  });
});

describe('sign-in settings before signing in', () => {
  it('tell the sign-in screens about passkeys and backup codes', async () => {
    await security.updateSettings(db, { backupCodesEnabled: false, passkeysEnabled: false });
    const off = await app.inject({ method: 'GET', url: '/signup-config' });
    expect(off.json()).toMatchObject({ passkeys: false, backupCodes: false });
    await security.updateSettings(db, { backupCodesEnabled: true, passkeysEnabled: true });
    expect((await app.inject({ method: 'GET', url: '/signup-config' })).json()).toMatchObject({ passkeys: true, backupCodes: true });
  });
});
