// Gathering and care: an event RSVP, a public group, and asking a prayer partner.
import { expect, test } from '@playwright/test';
import { as, signIn } from './helpers';

test('Ethel RSVPs to the prayer walk', async ({ page }) => {
  await signIn(page, 'ethel');
  await page.goto('/events');
  await page.getByText('[Demo] Saturday prayer walk').first().click();
  await page.getByRole('button', { name: "I'm going" }).click();
  await expect(page.getByText("We'll remind you")).toBeVisible();
});

test('Ethel joins a public group and posts in it', async ({ page }) => {
  await signIn(page, 'ethel');
  await page.goto('/groups');
  // Tapping a public group joins it.
  await page.getByText('[Demo] Morning prayer circle').first().click();
  await page.getByPlaceholder('Write to the group').fill('[Demo] Praying for everyone here today.');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('[Demo] Praying for everyone here today.')).toBeVisible();
});

test('Ethel asks for a prayer partner and the pastor reaches out', async ({ page, browser }) => {
  await signIn(page, 'ethel');
  await page.goto('/care');
  await page.getByPlaceholder('What would you like prayer for?').fill('[Demo] Would someone pray with me about my mother?');
  await page.getByRole('button', { name: 'Ask for a prayer partner' }).click();
  await expect(page.getByText('Your request is in')).toBeVisible();

  const pastor = await as(browser, 'pastor');
  await pastor.goto('/care');
  await pastor.getByText('Care queue').waitFor();
  const item = pastor.locator('div').filter({ hasText: 'pray with me about my mother' }).filter({ has: pastor.getByRole('button', { name: 'Reach out' }) }).last();
  await item.getByRole('button', { name: 'Reach out' }).click();
  await pastor.getByPlaceholder('Write a message').fill('[Demo] Hi Ethel, let us pray together now.');
  await pastor.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(pastor.getByText('[Demo] Hi Ethel, let us pray together now.')).toBeVisible();
  await pastor.context().close();
});
