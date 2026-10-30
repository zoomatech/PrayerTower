// The heart of the app: someone asks, someone else prays, promises to keep
// praying, and writes to them privately; the requester accepts and replies.
import { expect, test } from '@playwright/test';
import { as, card, postIdByText, signIn, unique } from './helpers';

test.describe.serial('ask, pray, commit and message', () => {
  const text = unique('[Demo] Please pray for my brother, his surgery is Friday.');
  let postId = '';

  test('Carol posts a prayer request', async ({ page }) => {
    await signIn(page, 'carol');
    await page.getByText('Type your prayer here').first().click();
    await page.getByPlaceholder('Type your prayer here').fill(text);
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(page.getByText(text).first()).toBeVisible();
    postId = await postIdByText(text);
  });

  test('Ethel prays now and commits to keep praying', async ({ page }) => {
    await signIn(page, 'ethel');
    const c = card(page, text);
    await c.scrollIntoViewIfNeeded();
    await c.getByRole('button', { name: 'Praying Now', exact: true }).click();
    await page.getByRole('button', { name: "I'm praying now" }).click();
    await expect(page.getByText('They will know someone is praying for them')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await c.getByRole('button', { name: 'Commit to Pray', exact: true }).click();
    await page.getByRole('button', { name: 'Make this commitment' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
    // The actions are one row of icons; the name (here "Committed") shows on hover.
    await c.getByRole('button', { name: 'Commit to Pray', exact: true }).hover();
    await expect(c.getByText('Committed', { exact: true })).toBeVisible();

    await page.getByText('My Promises').click();
    // The feed tab stays mounted underneath, so look only at what's on screen.
    await expect(page.getByText(text).filter({ visible: true }).first()).toBeVisible();
  });

  test('Ethel writes privately and Carol accepts and replies', async ({ page, browser }) => {
    await signIn(page, 'ethel');
    await page.goto(`/post/${postId}`);
    await page.getByText('Write to them privately').click();
    await page.getByPlaceholder('I prayed for you today…').fill('[Demo] I prayed for your brother tonight.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Your message is waiting for them')).toBeVisible();

    const carol = await as(browser, 'carol');
    // Messages opens from the Me menu, not the tab bar.
    await carol.getByRole('tab', { name: 'Me', exact: true }).click();
    await carol.getByTestId('open-messages').click();
    await carol.getByText('Requests and invites').waitFor();
    await carol.getByText('Demo Ethel', { exact: true }).first().click();
    await carol.getByRole('button', { name: 'Accept' }).click();
    await carol.getByPlaceholder('Write a message').fill('[Demo] Thank you, Ethel.');
    await carol.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(carol.getByText('[Demo] Thank you, Ethel.')).toBeVisible();
    await carol.context().close();
  });
});
