// Automated WCAG 2.1 A/AA checks (axe-core) on the main screens of the web build.
// This catches missing labels, contrast and role problems; VoiceOver on a phone is still checked by hand.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { postIdByText, signIn } from './helpers';

async function scan(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('the sign-in screen has no WCAG A/AA violations', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: /sign in/i }).last()).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('the main screens have no WCAG A/AA violations', async ({ page }) => {
  await signIn(page, 'carol');
  const found: Record<string, string[]> = {};
  found.feed = await scan(page);
  await page.goto('/compose');
  await page.waitForLoadState('networkidle');
  found.compose = await scan(page);
  const postId = await postIdByText('Pray for peace in our family over the holidays.');
  await page.goto(`/post/${postId}`);
  await page.waitForLoadState('networkidle');
  found.post = await scan(page);
  await page.goto('/profile');
  await page.waitForLoadState('networkidle');
  found.profile = await scan(page);
  await page.goto('/feedback');
  await page.waitForLoadState('networkidle');
  found.feedback = await scan(page);
  await page.goto('/tour');
  await page.waitForLoadState('networkidle');
  found.tour = await scan(page);
  expect(found).toEqual({ feed: [], compose: [], post: [], profile: [], feedback: [], tour: [] });
});
