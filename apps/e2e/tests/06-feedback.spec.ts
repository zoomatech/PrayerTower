// Pilot feedback: a member sends a bug report from the profile, and an admin reads and closes it.
import { expect, test } from '@playwright/test';
import { as, signIn, unique } from './helpers';

test('a member sends feedback and an admin marks it handled', async ({ page, browser }) => {
  const note = unique('The prayer list did not refresh');
  await signIn(page, 'ethel');
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Send feedback').filter({ visible: true }).first().click();
  await page.getByPlaceholder('What happened, and what did you expect?').fill(note);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Thank you! Your feedback was sent.')).toBeVisible();

  const admin = await as(browser, 'admin');
  await admin.goto('/admin');
  await expect(admin.getByText(note)).toBeVisible();
  await expect(admin.getByText(/Bug from Demo Ethel/).first()).toBeVisible();
  await admin.getByText(note).locator('xpath=..').getByText('Mark handled').click();
  await expect(admin.getByText(note)).toHaveCount(0);
});
