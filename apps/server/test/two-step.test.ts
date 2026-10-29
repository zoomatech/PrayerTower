import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as security from '../src/modules/security/index.js';
import { app, as, createUser, db } from './helpers.js';

const defaults = await security.settings(db);
let admin: string;
beforeAll(async () => {
  admin = await createUser('Security Admin');
  await grantRole(db, admin, 'admin', null);
});
afterAll(async () => {
  await security.updateSettings(db, { twoStepEnabled: defaults.two_step_enabled });
  await db.end();
});

const addFactor = (userId: string, status: 'verified' | 'unverified') =>
  db.query(
    `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
     values ($1, $2, '', 'totp', $3::auth.factor_status, now(), now())`,
    [randomUUID(), userId, status],
  );
const withCode = (userId: string) => app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer test:${userId}:aal2` } });

describe('two-step sign-in', () => {
  it('is off by default, and only admins switch it on', async () => {
    expect(defaults.two_step_enabled).toBe(false);
    expect((await as(admin).get('/features')).json().features.twoStep).toBe(false);
    const member = await createUser('Plain Member');
    expect((await as(member).patch('/admin/security-settings', { twoStepEnabled: true })).statusCode).toBe(403);
    const on = await as(admin).patch('/admin/security-settings', { twoStepEnabled: true });
    expect(on.json().settings.two_step_enabled).toBe(true);
    expect((await as(member).get('/features')).json().features.twoStep).toBe(true);
  });

  it('asks a member with an authenticator app for the code before anything else', async () => {
    const member = await createUser('Two Step Tess');
    await addFactor(member, 'unverified');
    // A factor still being set up doesn't count.
    expect((await as(member).get('/me')).statusCode).toBe(200);
    await addFactor(member, 'verified');
    const noCode = await as(member).get('/me');
    expect(noCode.statusCode).toBe(401);
    expect(noCode.json().error).toBe('two_step_required');
    expect((await withCode(member)).statusCode).toBe(200);
  });

  it('leaves members without a factor alone', async () => {
    const member = await createUser('One Step Olu');
    expect((await as(member).get('/me')).statusCode).toBe(200);
  });
});
