// An admin's announcement shows at the top of the feed, in the member's
// language, until they dismiss it; the feed with one showing passes axe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { as, db, signIn } from './helpers';

test('an admin posts an announcement, members see it in their language and dismiss it', async ({ page, browser }) => {
  const admin = await as(browser, 'admin');
  await admin.goto('/announcements');
  await admin.getByRole('checkbox', { name: 'Notice' }).click();
  const title = `Prayer night ${Date.now()}`;
  await admin.getByLabel('Title (English)').fill(title);
  await admin.getByLabel('Text (English)').fill('Join us Friday at 7pm.');
  await admin.getByLabel('Title in Spanish (optional)').fill(`Noche de oración ${title.slice(13)}`);
  await admin.getByRole('button', { name: 'Post to everyone' }).click();
  await expect(admin.getByText('Posted. Members see it')).toBeVisible();

  await signIn(page, 'carol');
  const region = page.getByRole('region', { name: 'Announcements' });
  await expect(region.getByText(title)).toBeVisible();
  await expect(region.getByText('Join us Friday at 7pm.')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);

  await page.evaluate(() => window.localStorage.setItem('prayer-tower.language', 'es'));
  await page.reload();
  await expect(page.getByText(`Noche de oración ${title.slice(13)}`)).toBeVisible();
  await page.getByRole('button', { name: `Cerrar: Noche de oración ${title.slice(13)}` }).click();
  await expect(page.getByText(`Noche de oración ${title.slice(13)}`)).toHaveCount(0);
  await page.evaluate(() => window.localStorage.removeItem('prayer-tower.language'));

  // Dismissed for good: it stays gone after a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Praying Now' }).first()).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  // Leave the feed clean for other specs.
  await db.query(`update public.announcements set ends_at = now() where title = $1`, [title]);
});
