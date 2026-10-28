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
    expect(await bootstrapAdmins(db, [` ${email} `, ''])).toBe(0);
    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [id]);
    expect(await bootstrapAdmins(db, [email])).toBe(1);
    expect(await roles(db, id)).toContain('admin');
    expect(await bootstrapAdmins(db, [email])).toBe(0); // already admin
    expect(await bootstrapAdmins(db, [])).toBe(0);
  });
});
