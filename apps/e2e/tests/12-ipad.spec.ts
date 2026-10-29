// iPad and Mac windows: the feed gains a side column (and a second card column
// when very wide), and Messages shows the list and a conversation side by side.
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test.use({ viewport: { width: 1024, height: 1366 }, isMobile: false, hasTouch: true });

test('iPad portrait: side column on the feed, split view in Messages', async ({ page }) => {
  await signIn(page, 'carol');
  await expect(page.getByText('Most prayed this week').filter({ visible: true })).toBeVisible();

  await page.getByRole('tab', { name: 'Messages', exact: true }).click();
  // A conversation opens beside the list, with no back button, and the tab bar stays.
  // Other tests add conversations with Ethel, so take the first.
  await page.getByRole('button', { name: /Demo Ethel/ }).first().click();
  await expect(page.getByPlaceholder(/Write a message/).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '‹ Messages' }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Messages', exact: true })).toBeVisible();
});

test('wide window: two columns of cards', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1024 });
  await signIn(page, 'carol');
  const actions = page.getByRole('button', { name: 'Praying Now', exact: true }).filter({ visible: true });
  await expect(actions.nth(1)).toBeVisible();
  const [a, b] = [await actions.nth(0).boundingBox(), await actions.nth(1).boundingBox()];
  // Side by side: the second card starts to the right, near the same height.
  expect(a && b && b.x > a.x + 300 && Math.abs(a.y - b.y) < 100).toBeTruthy();
});
