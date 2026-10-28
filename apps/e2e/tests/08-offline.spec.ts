// Poor network: the saved feed shows while offline, and a prayer and a text post
// made offline are sent once the connection is back.
import { expect, test } from '@playwright/test';
import { card, db, signIn, unique } from './helpers';

test('offline prayers and posts wait, then send when back online', async ({ page, context }) => {
  const request = 'Pray for peace in our family over the holidays.';
  const offlinePost = unique('Written on a train with no signal');
  await signIn(page, 'ruth');
  await expect(card(page, request)).toBeVisible();
  const { rows: before } = await db.query(`select count(*)::int as n from public.prayer_events e join public.profiles p on p.id = e.user_id where p.display_name = 'Demo Ruth'`);

  // The web build loads each screen's code on first visit; native apps ship it all.
  // Open the screens once while online so the test can use them offline.
  await page.getByRole('tab', { name: 'Me', exact: true }).click();
  await page.getByRole('tab', { name: 'Prayers', exact: true }).click();
  await page.getByText('Type your prayer here…').filter({ visible: true }).first().click();
  await expect(page.getByPlaceholder('Type your prayer here')).toBeVisible();
  await page.goBack();

  await context.setOffline(true);
  // Leave the feed and come back: it reloads, fails, and shows the saved copy.
  await page.getByRole('tab', { name: 'Me', exact: true }).click();
  await page.getByRole('tab', { name: 'Prayers', exact: true }).click();
  await expect(page.getByText(/You're offline\. Showing prayers saved/).filter({ visible: true })).toBeVisible();
  const c = card(page, request);
  await c.getByText('Praying Now', { exact: true }).click();
  await page.getByRole('button', { name: "I'm praying now" }).click();
  await expect(page.getByText("this will be sent as soon as you're back online")).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  // Still offline: write a text-only request.
  await page.getByText('Type your prayer here…').filter({ visible: true }).first().click();
  await page.getByPlaceholder('Type your prayer here').fill(offlinePost);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(/waiting to send/).filter({ visible: true }).first()).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('tab', { name: 'Me', exact: true }).click();
  await page.getByRole('tab', { name: 'Prayers', exact: true }).click();
  await expect(page.getByText(offlinePost).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/You're offline/).filter({ visible: true })).toHaveCount(0);
  const { rows: after } = await db.query(`select count(*)::int as n from public.prayer_events e join public.profiles p on p.id = e.user_id where p.display_name = 'Demo Ruth'`);
  expect(after[0].n).toBe(before[0].n + 1);
});
