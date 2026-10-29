// Harmful prayers and moderator care (docs/HARMFUL_PRAYERS.md): an admin switches both on,
// a threat is held and shown blurred to the moderator, the poster explains it, and grief,
// illness and Scripture that speak of death or enemies post normally.
import { expect, test } from '@playwright/test';
import { as, db, postIdByText, signIn, unique } from './helpers';

const status = async (id: string) =>
  (await db.query<{ moderation_status: string; harm_category: string | null }>('select moderation_status, harm_category from public.posts where id = $1', [id])).rows[0];

async function post(page: import('@playwright/test').Page, text: string) {
  await page.getByText('Type your prayer here').first().click();
  await page.getByPlaceholder('Type your prayer here').fill(text);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  return postIdByText(text);
}

test.describe.serial('harmful prayers', () => {
  const threat = unique("[Demo] I'm going to hurt him for what he did to my sister.");

  test.afterAll(async () => {
    await db.query('update public.harm_settings set enabled = false');
    await db.query('update public.moderator_care_settings set enabled = false');
  });

  test('an admin turns on the harmful-prayer check and moderator care', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/admin');
    await page.getByRole('switch', { name: /^Check for harmful prayers/ }).click();
    await expect(page.getByText('Harmful-prayer settings saved.')).toBeVisible();
    await page.getByRole('switch', { name: /^Look after moderators/ }).click();
    await expect(page.getByText('Moderator care saved.')).toBeVisible();
  });

  test('grief, illness and Scripture post normally', async ({ page }) => {
    await signIn(page, 'carol');
    for (const text of [
      unique('[Demo] My husband died last week. I wish he had not suffered so long.'),
      unique('[Demo] Kill the cancer cells, Lord. Pray the chemo destroys every tumor.'),
      unique('[Demo] Psalm 3:7: Strike all my enemies on the jaw. Pray for those who curse you.'),
    ]) {
      const id = await post(page, text);
      await expect.poll(() => status(id)).toEqual({ moderation_status: 'visible', harm_category: null });
    }
  });

  test('a threat is held, and the poster can explain it', async ({ page }) => {
    await signIn(page, 'carol');
    const id = await post(page, threat);
    await expect.poll(async () => (await status(id))?.moderation_status).toBe('hidden_pending_review');
    await page.goto('/notifications');
    await page.getByText('Your request is waiting for a moderator').first().scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Explain it' }).first().click();
    await page.getByPlaceholder('Your reason').fill('I was angry. I will not hurt anyone; please pray for my sister.');
    await page.getByRole('button', { name: 'Send appeal' }).click();
    await expect(page.getByText('The moderator will read this with your post.')).toBeVisible();
  });

  test('the moderator sees it blurred, reads it with the explanation, and keeps it', async ({ browser }) => {
    const admin = await as(browser, 'admin');
    await admin.goto('/moderation');
    const item = admin.locator('div').filter({ hasText: 'Possible threat' }).filter({ has: admin.getByRole('button', { name: 'Keep it' }) }).last();
    await expect(item.getByText('Tap to read it')).toBeVisible();
    await expect(item.getByText(threat)).toHaveCount(0);
    await item.getByRole('button', { name: 'Tap to read it' }).click();
    await expect(item.getByText(threat)).toBeVisible();
    await expect(item.getByText(/Their explanation: I was angry/)).toBeVisible();
    await item.getByRole('button', { name: 'Keep it' }).click();
    const id = await postIdByText(threat);
    await expect.poll(() => status(id)).toEqual({ moderation_status: 'visible', harm_category: null });
    await admin.context().close();
  });
});
