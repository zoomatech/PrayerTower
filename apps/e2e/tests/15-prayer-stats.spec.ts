// Gentle prayer stats on Me: Ethel sees her days prayed and streak, and can turn them off.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('prayer stats show on Me and can be turned off', async ({ page }) => {
  await signIn(page, 'ethel');
  await page.getByText('Me', { exact: true }).click();
  await expect(page.getByText('Your prayer life')).toBeVisible();
  await expect(page.getByText('Days prayed', { exact: true })).toBeVisible();
  await expect(page.getByText(/Only you can see these\./)).toBeVisible();

  const toggle = page.getByRole('switch', { name: /Show my prayer stats/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Your prayer life')).toHaveCount(0);
  await toggle.click();
  await expect(page.getByText('Your prayer life')).toBeVisible();
});
