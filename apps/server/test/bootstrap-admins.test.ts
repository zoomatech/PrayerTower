import { afterAll, describe, expect, it } from 'vitest';
import { bootstrapAdmins, roles } from '../src/modules/accounts/index.js';
import { createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('ADMIN_EMAILS', () => {
  it('makes a listed member admin only once their email is confirmed', async () => {
    const id = await createUser('First Admin');
    const { rows } = await db.query<{ email: string }>('select email from auth.users where id = $1', [id]);
    const email = rows[0]!.email.toUpperCase();
    await db.query('update auth.users set email_confirmed_at = null where id = $1', [id]);
    expect((await bootstrapAdmins(db, [` ${email} `, ''])).made).toBe(0);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [id]);
    expect((await bootstrapAdmins(db, [email])).made).toBe(1);
    expect(await roles(db, id)).toContain('admin');
    expect((await bootstrapAdmins(db, [email])).made).toBe(0); // already admin
    expect((await bootstrapAdmins(db, [])).made).toBe(0);
  });

  it('in production, needs a confirmation email Supabase actually sent', async () => {
    // With "Confirm email" off, Supabase confirms on sign-up and sends nothing: anyone could claim the address.
    const id = await createUser('Claimed Address');
    const { rows } = await db.query<{ email: string }>('select email from auth.users where id = $1', [id]);
    await db.query('update auth.users set email_confirmed_at = now(), confirmation_sent_at = null where id = $1', [id]);
    expect(await bootstrapAdmins(db, [rows[0]!.email], { viaEmail: true })).toEqual({ made: 0, unverified: 1 });
    expect(await roles(db, id)).not.toContain('admin');
    await db.query('update auth.users set confirmation_sent_at = now() - interval \'1 minute\' where id = $1', [id]);
    expect(await bootstrapAdmins(db, [rows[0]!.email], { viaEmail: true })).toEqual({ made: 1, unverified: 0 });
    await bootstrapAdmins(db, []);
  });

  it('lets the ADMIN_EMAILS addresses sign up without an invite code, and only while listed', async () => {
    const hook = async (email: string) =>
      (await db.query<{ r: { error?: unknown } }>(`select public.hook_before_user_created($1::jsonb) as r`, [{ user: { email, user_metadata: {}, app_metadata: {} } }])).rows[0]!.r;
    expect((await hook('steve@pilot.example')).error).toBeDefined();
    await bootstrapAdmins(db, ['Steve@Pilot.example']);
    expect(await hook('STEVE@pilot.example ')).toEqual({});
    expect((await hook('someone@pilot.example')).error).toBeDefined();
    await bootstrapAdmins(db, []);
    expect((await hook('steve@pilot.example')).error).toBeDefined();
  });
});
