// Backup codes for two-step sign-in (migration 20261029081300_two_step_recovery.sql,
// Admin → Sign-in security → Backup codes, off). A member who turned on two-step
// sign-in gets ten one-time codes to save. If they lose their phone, one code turns
// two-step sign-in off (their authenticator factors are removed) so they can sign in
// with their password and set it up again. Only hashes are stored; five wrong codes
// in an hour lock it for the rest of that hour.
//
// Supabase Auth's own recovery codes are still experimental and can't be switched on
// in the local CLI yet (https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate),
// so the server keeps these itself.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Db, Queryable } from '../../db.js';
import { withTx } from '../../db.js';
import { AppError, badRequest, forbidden } from '../../errors.js';
import * as notifications from '../notifications/index.js';
import { settings } from './index.js';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
export const COUNT = 10;
const MAX_WRONG_PER_HOUR = 5;
// Crockford base32: no I, L, O or U, so codes read aloud or copied by hand stay clear.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A new code like "K4M9-X7QP" (40 random bits). */
export function newCode() {
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Case, spaces and dashes don't matter; O is read as 0 and I or L as 1. */
export const normalize = (code: string) =>
  code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

const hash = async (code: string, salt: string) => (await scryptAsync(normalize(code), salt, 32)).toString('base64');

const hasFactor = async (q: Queryable, userId: string) =>
  (await q.query(`select 1 from auth.mfa_factors where user_id = $1 and factor_type::text = 'totp' and status::text = 'verified'`, [userId])).rowCount! > 0;

async function requireOn(q: Queryable) {
  if (!(await settings(q)).backup_codes_enabled) throw forbidden('Backup codes are off (Admin → Sign-in security)');
}

export async function status(q: Queryable, userId: string) {
  if (!(await settings(q)).backup_codes_enabled) return { enabled: false as const };
  const { rows } = await q.query<{ remaining: number; created_at: Date | null }>(
    `select count(*) filter (where used_at is null)::int as remaining, max(created_at) as created_at from public.two_step_backup_codes where user_id = $1`,
    [userId],
  );
  return { enabled: true as const, remaining: rows[0]?.remaining ?? 0, createdAt: rows[0]?.created_at ?? null };
}

/** A fresh set of codes, replacing any earlier set. The plain codes are returned this once only. */
export async function generate(db: Db, userId: string) {
  await requireOn(db);
  if (!(await hasFactor(db, userId))) throw badRequest('Turn on two-step sign-in first');
  const codes = Array.from({ length: COUNT }, newCode);
  await withTx(db, async (tx) => {
    await tx.query('delete from public.two_step_backup_codes where user_id = $1', [userId]);
    for (const code of codes) {
      const id = (await tx.query<{ id: string }>('select public.uuid_v7() as id')).rows[0]!.id;
      await tx.query('insert into public.two_step_backup_codes (id, user_id, code_hash) values ($1, $2, $3)', [id, userId, await hash(code, id)]);
    }
  });
  return { codes };
}

export const Recover = z.object({ code: z.string().trim().min(8).max(40) });

/**
 * Uses a code from a one-step (password only) sign-in: it is spent, the member's
 * authenticator factors are removed, the rest of the codes are cleared, and the member
 * gets a notice. They then sign in with just their password and can set it up again.
 */
export async function recover(db: Db, userId: string, code: string) {
  await requireOn(db);
  const { rows: wrong } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.two_step_backup_attempts where user_id = $1 and created_at > now() - interval '1 hour'`,
    [userId],
  );
  if ((wrong[0]?.n ?? 0) >= MAX_WRONG_PER_HOUR) throw new AppError(429, 'too_many_attempts', 'Too many wrong codes. Try again in an hour.');
  const { rows } = await db.query<{ id: string; code_hash: string }>(
    'select id, code_hash from public.two_step_backup_codes where user_id = $1 and used_at is null',
    [userId],
  );
  let match: string | null = null;
  for (const r of rows) {
    const a = Buffer.from(await hash(code, r.id), 'base64');
    const b = Buffer.from(r.code_hash, 'base64');
    if (a.length === b.length && timingSafeEqual(a, b)) match = r.id;
  }
  if (!match) {
    await db.query('insert into public.two_step_backup_attempts (user_id) values ($1)', [userId]);
    throw badRequest("That code didn't work. Check it, or use another one.");
  }
  await withTx(db, async (tx) => {
    // Spent first, so a second use of the same code (or a race) finds nothing.
    const spent = await tx.query('update public.two_step_backup_codes set used_at = now() where id = $1 and used_at is null', [match]);
    if (!spent.rowCount) throw badRequest("That code didn't work. Check it, or use another one.");
    await tx.query(`delete from auth.mfa_factors where user_id = $1 and factor_type::text = 'totp'`, [userId]);
    await tx.query('delete from public.two_step_backup_codes where user_id = $1', [userId]);
    await tx.query('delete from public.two_step_backup_attempts where user_id = $1', [userId]);
    await notifications.notify(tx, userId, {
      kind: 'account_security',
      title: 'Two-step sign-in was turned off with a backup code',
      body: "If this wasn't you, change your password now. You can turn two-step sign-in on again from Me → Password and email.",
      data: { screen: 'account-security' },
    });
  });
  return { ok: true };
}

/** Admin help for a member who lost their phone and their codes, after checking it's really them. */
export async function adminReset(db: Db, userId: string) {
  await withTx(db, async (tx) => {
    await tx.query(`delete from auth.mfa_factors where user_id = $1 and factor_type::text = 'totp'`, [userId]);
    await tx.query('delete from public.two_step_backup_codes where user_id = $1', [userId]);
    await notifications.notify(tx, userId, {
      kind: 'account_security',
      title: 'Two-step sign-in was turned off by the team',
      body: "You asked us to turn it off. If this wasn't you, change your password now and contact the team.",
      data: { screen: 'account-security' },
    });
  });
  return { ok: true };
}
