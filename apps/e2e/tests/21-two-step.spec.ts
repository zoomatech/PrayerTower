// Two-step sign-in: a member adds an authenticator app on Me → Password and
// email, signs in again with the password plus the app's code, then turns it off.
// The test plays the authenticator app (RFC 6238 TOTP: SHA-1, 6 digits, 30 s).
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db, DEMO_PASSWORD, signIn } from './helpers';

// Not James: 05-account deletes his account.
const EMAIL = 'ethel@demo.prayertower.local';

function base32(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
}

function totp(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** A code from a later 30-second window than `after`, since a code works only once. */
async function freshCode(secret: string, after: number) {
  while (Math.floor(Date.now() / 30_000) <= after) await new Promise((r) => setTimeout(r, 500));
  return totp(secret);
}

test.afterAll(async () => {
  await db.query(`delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)`, [EMAIL]);
  await db.query('update public.security_settings set two_step_enabled = false');
});

test('a member turns on two-step sign-in, signs in with a code, and turns it off', async ({ page }) => {
  await db.query('update public.security_settings set two_step_enabled = true');
  await signIn(page, 'ethel');
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Password and email').click();
  await page.getByTestId('two-step-start').click();
  const secret = (await page.getByTestId('two-step-secret').innerText()).trim();
  const firstStep = Math.floor(Date.now() / 30_000);
  await page.getByTestId('two-step-setup-code').fill(totp(secret));
  await page.getByTestId('two-step-finish').click();
  await expect(page.getByText(/Two-step sign-in is on/).first()).toBeVisible();

  // Signing in again now takes the code too.
  await page.getByText('‹ Back').click();
  await page.getByText('Sign out').click();
  await page.locator('input').nth(0).fill(EMAIL);
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page.getByText('Enter your code')).toBeVisible();
  await page.getByTestId('two-step-code').fill(await freshCode(secret, firstStep));
  await page.getByTestId('two-step-submit').click();
  await expect(page.getByText('Prayers', { exact: true }).first()).toBeVisible();

  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Password and email').click();
  await page.getByTestId('two-step-off').click();
  await expect(page.getByText('Two-step sign-in is off.')).toBeVisible();
});
