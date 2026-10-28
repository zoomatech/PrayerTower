import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { newCode } from '../src/modules/invites/index.js';
import { app, as, config, createUser, db } from './helpers.js';

afterAll(() => db.end());

const hook = async (userMetadata: object, appMetadata: object = {}) =>
  (await db.query<{ r: { error?: { http_code: number; message: string } } }>(`select public.hook_before_user_created($1::jsonb) as r`, [
    { metadata: { name: 'before-user-created' }, user: { email: 'new@example.com', user_metadata: userMetadata, app_metadata: appMetadata } },
  ])).rows[0]!.r;

// The local stack's publishable key, from `supabase status` (as in auth.test.ts).
function publishableKey(): string {
  if (process.env.SUPABASE_PUBLISHABLE_KEY) return process.env.SUPABASE_PUBLISHABLE_KEY;
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('{'))).PUBLISHABLE_KEY;
}

const signUp = (data: Record<string, string>) =>
  fetch(`${config.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: publishableKey(), 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${randomUUID()}@example.com`, password: 'a-long-test-password-1', data }),
  });

// Tests that switch invite-only mode live in this one file, so they run in order.
describe('invite codes', () => {
  it('refuses sign-up without a valid invite code while invite-only is on (the Auth hook)', async () => {
    await db.query('update public.invite_settings set invite_only = true');
    const none = await signUp({ display_name: 'Dana' });
    expect(none.status).toBe(403);
    expect(((await none.json()) as { msg?: string }).msg).toMatch(/invite-only/);
    const bad = await signUp({ display_name: 'Dana', invite_code: 'NOSUCHCODE' });
    expect(bad.status).toBe(403);
  });


  it('lets admins make, list and revoke codes, and nobody else', async () => {
    const admin = await createUser('Invite Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Invite Member');

    expect((await as(member).get('/admin/invites')).statusCode).toBe(403);
    expect((await as(member).post('/admin/invites', {})).statusCode).toBe(403);

    const made = await as(admin).post('/admin/invites', { note: 'Grace small group', maxUses: 3, expiresInDays: 7, count: 2 });
    expect(made.statusCode, made.body).toBe(201);
    const [a, b] = made.json().invites;
    expect(a).toMatchObject({ note: 'Grace small group', maxUses: 3, uses: 0, status: 'active', createdBy: 'Invite Admin' });
    expect(a.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(b.code).not.toBe(a.code);
    expect(new Date(a.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);

    const listed = (await as(admin).get('/admin/invites')).json();
    expect(listed.inviteOnly).toBe(true);
    expect(listed.invites.map((i: { code: string }) => i.code)).toEqual(expect.arrayContaining([a.code, b.code]));

    const revoked = await as(admin).post(`/admin/invites/${b.code.toLowerCase()}/revoke`);
    expect(revoked.json().invite).toMatchObject({ code: b.code, status: 'revoked' });
    expect((await as(admin).post('/admin/invites/NOSUCHCODE/revoke')).statusCode).toBe(404);
    expect((await as(admin).post('/admin/invites', { maxUses: 0 })).statusCode).toBe(400);
  });

  it('only lets a sign-up through with a valid code while invite-only is on', async () => {
    const code = newCode();
    await db.query(`insert into public.invite_codes (code, max_uses) values ($1, 1)`, [code]);
    const expired = newCode();
    await db.query(`insert into public.invite_codes (code, expires_at) values ($1, now() - interval '1 day')`, [expired]);

    expect((await hook({})).error?.message).toMatch(/invite-only/);
    expect((await hook({ invite_code: 'WRONG123' })).error?.http_code).toBe(403);
    expect((await hook({ invite_code: expired })).error?.message).toMatch(/not valid/);
    expect(await hook({ invite_code: ` ${code.toLowerCase()} ` })).toEqual({});
    // Single use: the second sign-up with it is refused.
    expect((await hook({ invite_code: code })).error?.message).toMatch(/not valid/);
    // Staff tools mark their accounts exempt.
    expect(await hook({}, { invite_exempt: 'true' })).toEqual({});

    // The new member's account remembers the code.
    const id = randomUUID();
    await db.query(`insert into auth.users (id, email, raw_user_meta_data, aud, role) values ($1, $2, $3, 'authenticated', 'authenticated')`, [
      id,
      `${id}@test.local`,
      { display_name: 'Invited Ivy', invite_code: code.toLowerCase() },
    ]);
    expect((await db.query('select code from public.invite_redemptions where user_id = $1', [id])).rows).toEqual([{ code }]);
  });

  it('opens sign-up for everyone when an admin turns invite-only off', async () => {
    const admin = await createUser('Switch Admin');
    await grantRole(db, admin, 'admin', null);
    expect((await app.inject({ method: 'GET', url: '/signup-config' })).json()).toEqual({ inviteOnly: true });
    try {
      expect((await as(admin).patch('/admin/invite-settings', { inviteOnly: false })).json()).toEqual({ inviteOnly: false });
      expect((await app.inject({ method: 'GET', url: '/signup-config' })).json()).toEqual({ inviteOnly: false });
      expect(await hook({})).toEqual({});
    } finally {
      await db.query('update public.invite_settings set invite_only = true');
    }
  });
});
