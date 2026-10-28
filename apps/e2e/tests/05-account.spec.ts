// Deleting an account from inside the app (App Store Review Guideline 5.1.1(v)). Runs last: it removes James.
import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, signIn } from './helpers';

test('a member deletes their account and can no longer sign in', async ({ page }) => {
  await signIn(page, 'james');
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Delete my account').first().click();
  await page.getByPlaceholder('DELETE').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('button', { name: /sign in/i }).last()).toBeVisible();

  await page.locator('input').nth(0).fill('james@demo.prayertower.local');
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible();
});
