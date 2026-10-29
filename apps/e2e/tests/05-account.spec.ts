// Deleting your own content and your account from inside the app (App Store Review Guideline 5.1.1(v)). Runs last: it removes James.
import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, postIdByText, signIn } from './helpers';

test('a member deletes one of their own requests', async ({ page }) => {
  const postId = await postIdByText('Pray for my neighbor, who lives alone');
  await signIn(page, 'carol');
  await page.goto(`/post/${postId}`);
  await page.getByText('Delete this request').click();
  await page.getByText('Tap again to delete this request for good').click();
  await page.goto(`/post/${postId}`);
  await expect(page.getByText('Pray for my neighbor, who lives alone')).toHaveCount(0);
});

test('a member deletes their account and can no longer sign in', async ({ page }) => {
  await signIn(page, 'james');
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Delete my account').first().click();
  await page.getByPlaceholder('DELETE').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

  await page.locator('input').nth(0).fill('james@demo.prayertower.local');
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible();
});
