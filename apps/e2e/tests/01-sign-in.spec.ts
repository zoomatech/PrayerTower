import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, signIn } from './helpers';

test('a member signs in and sees the prayer feed', async ({ page }) => {
  await signIn(page, 'ethel');
  await expect(page.getByText("Let's talk to the Lord").first()).toBeVisible();
  await expect(page.getByText('[Demo] Please pray for my mother').first()).toBeVisible();
});

test('a wrong password is refused', async ({ page }) => {
  await page.goto('/sign-in');
  await page.locator('input').nth(0).fill('ethel@demo.prayertower.local');
  await page.locator('input[type=password]').fill(`${DEMO_PASSWORD}-wrong`);
  await page.getByRole('button', { name: /^sign in$/i }).last().click();
  await expect(page.getByText(/invalid/i).first()).toBeVisible();
});
