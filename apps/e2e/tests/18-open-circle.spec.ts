// Open Circle walk: an Open Circle member visits every member screen, and no
// screen shows a religious word (docs/OPEN_CIRCLE.md). Set OPEN_CIRCLE_SHOTS
// to a folder to keep a screenshot of each screen.
import { expect, test, type Page } from '@playwright/test';

import { db, DEMO_PASSWORD, postIdByText, unique } from './helpers';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|church\w*|amen|blessed|scripture|priestly|pastor\w*|testimon\w*|confession\w*|faith|prais\w*)\b/gi;
const SCREENS = [
  '/', '/commitments', '/messages', '/notifications', '/profile', '/compose', '/tour', '/notification-settings', '/feedback', '/rules',
  '/groups', '/events', '/care', '/highlights', '/witness', '/help-stories', '/awards', '/pools', '/prayer-cast', '/branch',
  '/live', '/macro-needs', '/circle-prep', '/token-store', '/delete-account',
];
const shots = process.env.OPEN_CIRCLE_SHOTS;

async function signInFresh(page: Page) {
  const { rows } = await db.query<{ id: string }>("select id from auth.users where email = 'ruth@demo.prayertower.local'");
  await page.addInitScript((key) => window.localStorage.setItem(key, '1'), `tour:seen:v1:${rows[0]!.id}`);
  await page.goto('/sign-in');
  await page.locator('input').nth(0).fill('ruth@demo.prayertower.local');
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await expect(page.getByText('Support').first()).toBeVisible();
}

/** Lines with religious words in the screen's own text, leaving out what members wrote (demo content is marked [Demo]).
 * The community chooser on Me may name the default community, Prayer Tower. */
async function words(page: Page, written: string[]) {
  let text = await page.locator('body').innerText();
  for (const w of written) text = text.split(w).join('');
  return [...new Set(text.split('\n').filter((line) => !line.includes('[Demo]') && line.trim() !== 'Prayer Tower' && line.match(RELIGIOUS)).map((line) => line.trim().slice(0, 120)))];
}

test('an Open Circle member never sees religious wording', async ({ page }) => {
  test.setTimeout(240_000);
  await db.query("update public.communities set status = 'active' where slug = 'open-circle'");
  const { rows: user } = await db.query<{ id: string }>("select id from auth.users where email = 'ruth@demo.prayertower.local'");
  const ruth = user[0]!.id;
  // Ruth moves to Open Circle, leaving her Christian-feed requests behind.
  await db.query('delete from public.community_memberships where user_id = $1', [ruth]);
  await db.query("insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'", [ruth]);
  const { rows: written } = await db.query<{ body: string }>('select body from public.posts where user_id = $1', [ruth]);

  // Tall enough to show most of each screen in one screenshot.
  await page.setViewportSize({ width: 412, height: 1600 });
  await signInFresh(page);
  const body = unique('Could use some cheering on before my driving test');
  await page.goto('/compose');
  await page.locator('textarea').first().fill(body);
  await page.getByRole('button', { name: /^post/i }).last().click();
  await expect(page.getByText(body).first()).toBeVisible();
  const postId = await postIdByText(body);

  const found: string[] = [];
  for (const path of [...SCREENS, `/post/${postId}`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const hits = await words(page, [body, ...written.map((w) => w.body)]);
    if (hits.length) found.push(`${path}: ${hits.join(' | ')}`);
    if (shots) await page.screenshot({ path: `${shots}/${path === '/' ? 'feed' : path.slice(1).replace(/\//g, '-').replace(/-[0-9a-f-]{36}$/, '')}.png`, fullPage: true });
  }
  expect(found, found.join('\n')).toEqual([]);
});
