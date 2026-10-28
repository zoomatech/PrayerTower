// The first-run tour: shown once after sign-in, skippable, and available again from Me.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('the tour shows once, can be stepped through, and reopens from Me', async ({ page }) => {
  await signIn(page, 'pastor', { tour: true });
  await expect(page.getByText('Ask for prayer', { exact: true })).toBeVisible();
  await expect(page.getByText('1 of 5')).toBeVisible();
  for (const title of ['Pray now', 'Keep a promise to pray', 'Tokens, never money', 'A safe place']) {
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Start praying' }).click();
  await expect(page.getByText('Ask for prayer', { exact: true })).toHaveCount(0);
  // Leaving the tour updates the address a moment later; reloading before that reopens /tour.
  await expect(page).not.toHaveURL(/\/tour/);

  // Not shown again on the next visit.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Prayers', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByText('1 of 5')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Me', exact: true }).click();
  await page.getByText('How Prayer Tower works').filter({ visible: true }).first().click();
  await expect(page.getByText('1 of 5')).toBeVisible();
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByText('1 of 5')).toHaveCount(0);
});
