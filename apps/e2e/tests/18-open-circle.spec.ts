// Open Circle walk: an Open Circle member visits every member screen, and no
// screen shows a religious word (docs/OPEN_CIRCLE.md) or has a WCAG A/AA
// violation (axe-core, as in 07-accessibility). Set OPEN_CIRCLE_SHOTS to a
// folder to keep a screenshot of each screen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Response } from '@playwright/test';

import { db, DEMO_PASSWORD, postIdByText, unique } from './helpers';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|christ\w*|bible|psalms?|gospel|ministry|worship\w*|spiritual|church\w*|amen|blessed|scripture|priestly|pastor\w*|testimon\w*|confession\w*|faith|prais\w*)\b/gi;
const SCREENS = [
  '/', '/commitments', '/messages', '/notifications', '/profile', '/compose', '/tour', '/notification-settings', '/feedback', '/rules',
  '/groups', '/events', '/care', '/highlights', '/witness', '/help-stories', '/awards', '/pools', '/prayer-cast', '/branch',
  '/live', '/macro-needs', '/circle-prep', '/token-store', '/podcasts', '/surveys', '/delete-account', '/squire-board', '/prayer-list',
  '/why-gifts', '/give', '/account-security', '/two-step', '/ai-chat', '/announcements', '/churches', '/church', '/listen', '/listen-on-air', '/onboarding',
  '/prayer-chain', '/prayer-minute', '/remembered', '/scheduled', '/skin-idea', '/skin-gallery', '/waitlist', '/reading-plan', '/invites',
  '/meaning-words', '/kindness-research', '/crosspost',
];
const shots = process.env.OPEN_CIRCLE_SHOTS;

async function signInFresh(page: Page) {
  const { rows } = await db.query<{ id: string }>("select id from auth.users where email = 'ruth@demo.prayertower.local'");
  await page.addInitScript((key) => window.localStorage.setItem(key, '1'), `tour:seen:v1:${rows[0]!.id}`);
  await page.goto('/sign-in');
  await page.locator('input').nth(0).fill('ruth@demo.prayertower.local');
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Support').first()).toBeVisible();
}

/** Lines with religious words in the screen's own text, leaving out what members wrote (demo content is marked [Demo]).
 * The community chooser on Me may name the default community, Prayer Tower. */
async function words(page: Page, written: string[]) {
  // Screen readers read the labels too, so they count as screen text.
  const labels = await page.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  let text = [await page.locator('body').innerText(), ...labels].join('\n');
  for (const w of written) text = text.split(w).join('');
  return [...new Set(text.split('\n').filter((line) => !line.includes('[Demo]') && line.trim() !== 'Prayer Tower' && line.match(RELIGIOUS)).map((line) => line.trim().slice(0, 120)))];
}

test('an Open Circle member never sees religious wording or an accessibility violation, with switches off and on', async ({ page }) => {
  test.setTimeout(480_000);
  await db.query("update public.communities set status = 'active' where slug = 'open-circle'");
  const { rows: user } = await db.query<{ id: string }>("select id from auth.users where email = 'ruth@demo.prayertower.local'");
  const ruth = user[0]!.id;
  // Ruth moves to Open Circle, leaving her Christian-feed requests behind.
  await db.query('delete from public.community_memberships where user_id = $1', [ruth]);
  await db.query("insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'", [ruth]);
  // Earlier tests post as Ruth; age those posts so the new-member limit (3 a day) leaves room for one more.
  await db.query("update public.posts set created_at = created_at - interval '2 days' where user_id = $1", [ruth]);
  const { rows: written } = await db.query<{ body: string }>('select body from public.posts where user_id = $1', [ruth]);
  // Her sign-in address (Me → Account security) is the demo domain, not app wording.
  written.push({ body: 'ruth@demo.prayertower.local' });

  // Tall enough to show most of each screen in one screenshot.
  await page.setViewportSize({ width: 412, height: 1600 });
  await signInFresh(page);
  const body = unique('Could use some cheering on before my driving test');
  await page.goto('/compose');
  await page.locator('textarea').first().fill(body);
  await page.getByRole('button', { name: /^post/i }).last().click();
  await expect(page.getByText(body).first()).toBeVisible();
  const postId = await postIdByText(body);

  const off = await walk(page, postId, [body, ...written.map((w) => w.body)], '');
  expect(off.words, off.words.join('\n')).toEqual([]);
  expect(off.a11y, off.a11y.join('\n')).toEqual([]);

  // Again with every feature switch on, so the switched-off screens show their real content.
  const saved = await db.query<{ t: string; c: string }>(
    `select table_name as t, column_name as c from information_schema.columns
      where table_schema = 'public' and data_type = 'boolean' and table_name like '%settings' and (column_name like '%enabled')`,
  );
  const before: { t: string; c: string; v: boolean }[] = [];
  for (const r of saved.rows) {
    const { rows } = await db.query<{ v: boolean }>(`select ${r.c} as v from public.${r.t} limit 1`);
    before.push({ ...r, v: rows[0]?.v ?? false });
    await db.query(`update public.${r.t} set ${r.c} = true`);
  }
  try {
    const on = await walk(page, postId, [body, ...written.map((w) => w.body)], 'on-');
    expect(on.words, on.words.join('\n')).toEqual([]);
    expect(on.a11y, on.a11y.join('\n')).toEqual([]);
  } finally {
    for (const r of before) await db.query(`update public.${r.t} set ${r.c} = $1`, [r.v]);
  }
});

/** Visits every screen; returns lines with religious words and accessibility violations. */
async function walk(page: Page, postId: string, written: string[], prefix: string) {
  const found: string[] = [];
  const a11y: string[] = [];
  // As in 22-pilot-walk: no screen may crash or get a server error.
  let here = '';
  const onError = (e: Error) => a11y.push(`${here}: page error ${e.message.slice(0, 200)}`);
  const onResponse = (r: Response) => {
    if (r.status() >= 500) a11y.push(`${here}: ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  };
  page.on('pageerror', onError);
  page.on('response', onResponse);
  for (const path of [...SCREENS, `/post/${postId}`]) {
    here = path;
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const hits = await words(page, written);
    if (hits.length) found.push(`${path}: ${hits.join(' | ')}`);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    for (const v of violations) a11y.push(`${path}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    if (shots) await page.screenshot({ path: `${shots}/${prefix}${path === '/' ? 'feed' : path.slice(1).replace(/\//g, '-').replace(/-[0-9a-f-]{36}$/, '')}.png`, fullPage: true });
  }
  page.off('pageerror', onError);
  page.off('response', onResponse);
  return { words: found, a11y };
}
