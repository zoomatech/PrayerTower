// Forgot password, then change it back from Me → Password and email. The reset
// email is read from the local Supabase mail catcher (Mailpit).
import { expect, test, type Page } from '@playwright/test';
import { db, DEMO_PASSWORD } from './helpers';

const MAIL = process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:54324';
const EMAIL = 'ruth@demo.prayertower.local';
const TEMP = 'a-brand-new-pass-1';
/** The tab bar, in either edition: 18-open-circle moves Ruth to Open Circle, whose feed isn't "Prayers". */
const signedIn = (page: Page) => expect(page.getByText('Me', { exact: true })).toBeVisible();

/** The code from the newest password reset email to this address. */
async function resetCode(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const found = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${to} subject:"Reset your password"`)}`)).json();
    const id = found.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${id}`)).json();
      const code = String(msg.Text ?? '').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no reset email for ${to}`);
}

test('a member resets a forgotten password with the emailed code, then changes it back', async ({ page }) => {
  await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL}`)}`, { method: 'DELETE' });
  const { rows } = await db.query<{ id: string }>('select id from auth.users where email = $1', [EMAIL]);
  await page.addInitScript((key) => window.localStorage.setItem(key, '1'), `tour:seen:v1:${rows[0]!.id}`);
  await page.goto('/sign-in');
  await page.getByText('Forgot your password?').click();
  await page.getByTestId('reset-email').fill(EMAIL);
  await page.getByTestId('reset-send').click();
  await expect(page.getByText(/Check your email/)).toBeVisible();

  await page.getByTestId('reset-code').fill(await resetCode(EMAIL));
  await page.getByTestId('reset-continue').click();
  await expect(page.getByText('Choose a new password')).toBeVisible();
  await page.getByTestId('new-password').fill(TEMP);
  await page.getByTestId('new-password-again').fill(TEMP);
  await page.getByTestId('save-password').click();
  await signedIn(page);

  // Signed out and back in with the new password, then put the demo password back.
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Sign out').click();
  await page.locator('input').nth(0).fill(EMAIL);
  await page.locator('input[type=password]').fill(TEMP);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await signedIn(page);
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Password and email').click();
  await page.getByTestId('new-password').fill(DEMO_PASSWORD);
  await page.getByTestId('new-password-again').fill(DEMO_PASSWORD);
  await page.getByTestId('save-password').click();
  await expect(page.getByText('Your password is changed.')).toBeVisible();
});
