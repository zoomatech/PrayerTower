// Admin → Operations shows the worker, job queue, server errors and radio, and passes axe.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { as } from './helpers';

test('an admin checks Operations', async ({ browser }) => {
  const admin = await as(browser, 'admin');
  await admin.goto('/ops');
  await expect(admin.getByRole('heading', { name: 'Background worker' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Job queue' })).toBeVisible();
  await expect(admin.getByRole('heading', { name: 'Server errors' })).toBeVisible();
  await expect(admin.getByText('Mode: log only (no station)')).toBeVisible();
  await expect(admin.getByRole('status').first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page: admin }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
});
