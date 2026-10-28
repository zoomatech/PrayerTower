// Download my data: the web build saves a JSON file with the member's account.
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('a member downloads their data from Me', async ({ page }) => {
  await signIn(page, 'carol');
  await page.getByText('Me', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^prayer-tower-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(data.profile.display_name).toBe('Demo Carol');
  expect(data.account.email).toBe('carol@demo.prayertower.local');
  expect(data.posts.length).toBeGreaterThan(0);
});
