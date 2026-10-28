// An admin's announcement shows at the top of the feed, in English, until they
// dismiss it; the feed with one showing passes axe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { as, db, signIn } from './helpers';

test('an admin posts an announcement, members see it and dismiss it', async ({ page, browser }) => {
  const admin = await as(browser, 'admin');
  await admin.goto('/announcements');
  await admin.getByRole('checkbox', { name: 'Notice' }).click();
  const title = `Prayer night ${Date.now()}`;
  await admin.getByLabel('Title (English)').fill(title);
  await admin.getByLabel('Text (English)').fill('Join us Friday at 7pm.');
  // English only: no Spanish fields.
  await expect(admin.getByLabel('Title in Spanish (optional)')).toHaveCount(0);
  await admin.getByRole('button', { name: 'Post to everyone' }).click();
  await expect(admin.getByText('Posted. Members see it')).toBeVisible();

  await signIn(page, 'carol');
  const region = page.getByRole('region', { name: 'Announcements' });
  await expect(region.getByText(title)).toBeVisible();
  await expect(region.getByText('Join us Friday at 7pm.')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await region.getByRole('button', { name: `Dismiss: ${title}` }).click();
  await expect(page.getByText(title)).toHaveCount(0);

  // Dismissed for good: it stays gone after a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Praying Now' }).first()).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  // Leave the feed clean for other specs.
  await db.query(`update public.announcements set ends_at = now() where title = $1`, [title]);
});
