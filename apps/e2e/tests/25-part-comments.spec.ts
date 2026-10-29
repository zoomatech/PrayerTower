// Comments at block breaks (notebook Page 13): with the switch on, a long request shows
// "Comment on this part" after each ~200-word part; the comment joins the others at the
// end, marked with its part.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { db, signIn, unique } from './helpers';

const sentence = (i: number) => `Day ${i} we sat in the waiting room and asked friends to keep us in their hearts.`;

test('a member comments on one part of a long request', async ({ page }) => {
  const reply = unique('That third week sounds so hard. Praying.');
  const { rows: ruth } = await db.query<{ id: string }>("select id from auth.users where email = 'ruth@demo.prayertower.local'");
  const body = `[Demo] ${Array.from({ length: 30 }, (_, i) => sentence(i + 1)).join(' ')}`;
  const { rows: post } = await db.query<{ id: string }>(
    "insert into public.posts (user_id, community_id, post_type, body) values ($1, public.default_community_id(), 'prayer_request', $2) returning id",
    [ruth[0]!.id, body],
  );
  await db.query('update public.conversation_settings set part_comments_enabled = true');
  try {
    await signIn(page, 'ethel');
    await page.goto(`/post/${post[0]!.id}`);
    const links = page.getByRole('button', { name: /Comment on this part/ });
    await expect(links).toHaveCount(3);
    await links.nth(2).click();
    await expect(page.getByText('Commenting on part 3 of 3')).toBeVisible();
    await page.getByPlaceholder('Write a comment').fill(reply);
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(page.getByText(reply)).toBeVisible();
    await expect(page.getByText('· On part 3')).toBeVisible();
    await expect(page.getByText('1 on this part')).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  } finally {
    await db.query('update public.conversation_settings set part_comments_enabled = false');
    await db.query('delete from public.posts where id = $1', [post[0]!.id]);
  }
});
