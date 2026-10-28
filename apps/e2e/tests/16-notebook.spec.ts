// Notebook features: the thanksgiving card opens a praise post, and the
// "Prayer and positive thoughts welcome" label shows on the card.
import { expect, test } from '@playwright/test';
import { db, signIn, unique } from './helpers';

test('thanksgiving card leads to a praise post with the support label', async ({ page }) => {
  // Carol hasn't dismissed the card or posted a praise this week in a fresh run.
  await db.query(`update public.profiles set thanks_card_dismissed_at = null where display_name = 'Demo Carol'`);
  await db.query(`delete from public.posts p using public.profiles pr where pr.id = p.user_id and pr.display_name = 'Demo Carol' and p.post_type = 'praise'`);
  await signIn(page, 'carol');
  await expect(page.getByText('Give thanks', { exact: false }).first()).toBeVisible();
  await page.getByText('Post a praise').click();

  const text = unique('Thank you Lord for rain on the garden');
  await page.getByPlaceholder(/prayer|praise|heart/i).first().fill(text);
  await page.getByRole('switch', { name: /Prayer and positive thoughts welcome/ }).click();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect(page.getByText(/Prayer and positive thoughts welcome/).first()).toBeVisible();
});
