// Answered prayer with a testimony: the poster marks the request answered and
// tells what God did; it then shows under the Testimonies filter. (Demo Pastor posts here:
// Ruth already reaches the new-member limit of 3 requests a day in 08-offline.)
import { expect, test } from '@playwright/test';
import { postIdByText, signIn, unique } from './helpers';

test('a member shares a testimony and it shows under Testimonies', async ({ page }) => {
  const text = unique('[Demo] Pray that my sister finds a job.');
  const testimony = unique('She was hired on Monday. Thank you all for praying!');
  await signIn(page, 'pastor');
  await page.getByText('Type your prayer here').first().click();
  await page.getByPlaceholder('Type your prayer here').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await postIdByText(text); // saved before we open it

  await page.getByRole('link', { name: text }).first().click();
  await page.getByRole('button', { name: 'Mark this prayer answered' }).click();
  await page.getByLabel('How did God answer? Share a testimony (optional)').fill(testimony);
  await page.getByRole('button', { name: 'Mark this prayer answered' }).click();
  await expect(page.getByText(testimony)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit testimony' })).toBeVisible();

  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.getByRole('checkbox', { name: 'Testimonies' }).click();
  await expect(page.getByText('Answered prayers, in the words of the people who asked.')).toBeVisible();
  await expect(page.getByText(testimony)).toBeVisible();
});
