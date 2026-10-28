// Church partners: a pastor applies for their church, an admin verifies it,
// and the pastor sees it verified on their Me page.
import { expect, test } from '@playwright/test';
import { as, db, signIn, unique } from './helpers';

test('a pastor applies for their church and an admin verifies it', async ({ page, browser }) => {
  // Setup only (05-account deletes James, so this uses Demo Pastor): a rerun on the same database starts without Demo Pastor's earlier application.
  await db.query(`delete from public.churches where applicant_id = (select id from auth.users where email = 'pastor@demo.prayertower.local')`);
  const church = unique('Grace Chapel');
  await signIn(page, 'pastor');
  await page.getByText('Me', { exact: true }).click();
  await page.getByText('Are you a pastor? Add your church').filter({ visible: true }).first().click();
  await page.getByLabel('Church name').fill(church);
  await page.getByLabel('Your title').fill('Senior Pastor');
  await page.getByLabel('City').fill('Dayton');
  await page.getByLabel('Country').fill('United States');
  await page.getByLabel('Church website (optional)').fill('https://gracechapel.example');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText('Waiting for review')).toBeVisible();

  const admin = await as(browser, 'admin');
  await admin.goto('/churches');
  const entry = admin.locator('div').filter({ hasText: church }).filter({ has: admin.getByText('Verify church', { exact: true }) }).last();
  await expect(entry.getByText(/Applied by Demo Pastor \(Senior Pastor\)/)).toBeVisible();
  await entry.getByText('Verify church', { exact: true }).click();
  await expect(admin.getByText(church)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByText(`Your badge: Senior Pastor · ${church}. It never shows on anonymous posts.`)).toBeVisible();
});
