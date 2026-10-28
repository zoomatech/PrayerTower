// Safety: a member reports a request, a moderator reviews it, and staff pages stay closed to members.
import { expect, test } from '@playwright/test';
import { as, postIdByText, signIn } from './helpers';

test('a report reaches the moderation queue and the moderator keeps the post', async ({ page, browser }) => {
  const postId = await postIdByText('Our church needs a fair roofer');
  await signIn(page, 'james');
  await page.goto(`/post/${postId}`);
  await page.getByText('Report this request').click();
  await page.getByText('Spam or selling', { exact: true }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByText('A moderator will review this')).toBeVisible();

  const admin = await as(browser, 'admin');
  await admin.goto('/moderation');
  const item = admin.locator('div').filter({ hasText: 'Our church needs a fair roofer' }).filter({ has: admin.getByRole('button', { name: 'Keep it' }) }).last();
  await item.getByRole('button', { name: 'Keep it' }).click();
  await expect(admin.getByText('Our church needs a fair roofer')).toHaveCount(0);
  await admin.context().close();
});

test('a member cannot open the moderation queue', async ({ page }) => {
  await signIn(page, 'ethel');
  await page.goto('/moderation');
  await expect(page.getByText(/moderators only/i).first()).toBeVisible();
});
