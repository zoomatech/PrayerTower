// Notification settings: turn one kind of alert off and set quiet hours.
import { expect, test } from '@playwright/test';
import { db, signIn } from './helpers';

test('a member turns prayer alerts off and sets quiet hours', async ({ page }) => {
  await signIn(page, 'ruth');
  await page.getByRole('tab', { name: 'Me', exact: true }).click();
  await page.getByRole('button', { name: 'Notification settings' }).filter({ visible: true }).first().click();
  await page.getByRole('switch', { name: /Prayers for you/ }).click();
  await expect(page.getByRole('switch', { name: /Prayers for you/ })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: /Quiet hours/ }).click();
  await page.getByRole('checkbox', { name: '21:00' }).click();
  await expect(page.getByRole('checkbox', { name: '21:00' })).toHaveAttribute('aria-checked', 'true');

  const { rows } = await db.query(`select p.notification_prefs from public.profiles p join auth.users u on u.id = p.id where u.email = 'ruth@demo.prayertower.local'`);
  expect(rows[0].notification_prefs.off).toEqual(['prayers']);
  expect(rows[0].notification_prefs.quietHours).toMatchObject({ start: '21:00', end: '07:00' });
});
