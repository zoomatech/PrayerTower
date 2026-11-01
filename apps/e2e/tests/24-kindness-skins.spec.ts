// Kindness features on every skin: with every switch on, the feed and a request page are
// opened in each of the 13 year-round skins. Every card keeps ONE row of action icons
// (Steve, 2026-10-29) with at most seven icons (thumbs up joined on 2026-10-30), nothing scrolls sideways, and axe finds no
// WCAG A/AA violation. Set SKIN_SHOTS to a folder to keep a screenshot of each.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { db, signIn } from './helpers';

const shots = process.env.SKIN_SHOTS;

test.use({ viewport: { width: 390, height: 1400 } });

test('every skin keeps one icon row and passes axe with the kindness tools on', async ({ page }) => {
  test.setTimeout(900_000);
  const { rows: switches } = await db.query<{ t: string; c: string }>(
    `select table_name as t, column_name as c from information_schema.columns
      where table_schema = 'public' and data_type = 'boolean' and table_name like '%settings' and column_name like '%enabled'`,
  );
  const before: { t: string; c: string; v: boolean }[] = [];
  for (const s of switches) {
    const { rows } = await db.query<{ v: boolean }>(`select ${s.c} as v from public.${s.t} limit 1`);
    before.push({ ...s, v: rows[0]?.v ?? false });
    await db.query(`update public.${s.t} set ${s.c} = true`);
  }
  const { rows: ethel } = await db.query<{ id: string }>("select id from auth.users where email = 'ethel@demo.prayertower.local'");
  const { rows: chosen } = await db.query<{ feed_theme_id: string | null }>('select feed_theme_id from public.community_memberships where user_id = $1 and is_primary', [ethel[0]!.id]);
  const problems: string[] = [];
  try {
    await signIn(page, 'ethel');
    const { rows: post } = await db.query<{ id: string }>(
      "select id from public.posts where post_type = 'prayer_request' and moderation_status = 'visible' and community_id = public.default_community_id() order by created_at desc limit 1",
    );
    const { rows: skins } = await db.query<{ id: string; slug: string }>('select id, slug from public.feed_themes where season is null and status <> \'retired\' order by slug');
    expect(skins.length).toBeGreaterThanOrEqual(13);
    for (const skin of skins) {
      await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [ethel[0]!.id, skin.id]);
      for (const [name, path] of [
        ['feed', '/'],
        ['request', `/post/${post[0]!.id}`],
      ] as const) {
        const here = `${skin.slug} ${name}`;
        // With every switch on a page makes many calls; if the API's per-minute limit is hit, wait it out.
        for (let attempt = 0; attempt < 4; attempt++) {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          if (!(await page.getByText(/Rate limit exceeded/).count())) break;
          await page.waitForTimeout(20_000);
        }
        // The tower skin starts at its foot and shows one request at a time: climb to the first.
        await page.getByTestId('card-actions').or(page.getByText('Climb up', { exact: true })).first().waitFor({ timeout: 60_000 });
        if (!(await page.getByTestId('card-actions').count())) await page.getByText('Climb up', { exact: true }).click();
        await page.getByTestId('card-actions').first().waitFor({ timeout: 30_000 });
        // Neon Circuit draws each frame in over 1.6 s and only then fades its words in (Steve,
        // 2026-10-30); axe reads half-faded words as too faint, so wait for the drawing to finish.
        await page.waitForTimeout(skin.slug === 'neon-circuit' ? 2000 : 600);
        const rows = await page.getByTestId('card-actions').evaluateAll((els) =>
          els
            .filter((el) => (el as HTMLElement).offsetParent !== null)
            .map((el) => {
              const tops = [...el.children].map((c) => Math.round(c.getBoundingClientRect().top));
              return { icons: tops.length, spread: tops.length ? Math.max(...tops) - Math.min(...tops) : 0 };
            }),
        );
        for (const [i, r] of rows.entries()) {
          if (r.spread > 4) problems.push(`${here}: card ${i + 1} wraps its icons onto a second row`);
          if (r.icons > 7) problems.push(`${here}: card ${i + 1} shows ${r.icons} icons`);
        }
        // No second row of emoji anywhere on the page: meanings ride on the action icons.
        const trays = await page.getByRole('group', { name: 'Say it with an emoji' }).count();
        if (trays) problems.push(`${here}: shows a separate emoji row`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) problems.push(`${here}: scrolls sideways by ${overflow}px`);
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of violations) problems.push(`${here}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
        if (shots) await page.screenshot({ path: `${shots}/${skin.slug}-${name}.png` });
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
    await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [ethel[0]!.id, chosen[0]?.feed_theme_id ?? null]);
    // This walk spends most of the API's per-minute allowance: let it refill so the next test isn't rate limited.
    await page.waitForTimeout(61_000);
  }
});
