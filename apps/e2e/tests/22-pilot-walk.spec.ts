// Pilot walk, Prayer Tower edition: a member visits every member screen with every
// feature switch on. No screen may crash (a page error), get a server error (5xx) from
// the API, or fail an axe WCAG A/AA check. 18-open-circle walks the other edition.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { db, signIn } from './helpers';

const SCREENS = [
  '/', '/commitments', '/messages', '/notifications', '/profile', '/compose', '/notification-settings', '/feedback', '/rules',
  '/groups', '/events', '/care', '/highlights', '/witness', '/help-stories', '/awards', '/pools', '/prayer-cast', '/branch',
  '/live', '/macro-needs', '/circle-prep', '/token-store', '/podcasts', '/surveys', '/give', '/why-gifts', '/scheduled',
  '/prayer-minute', '/prayer-chain', '/skin-idea', '/squire-board', '/prayer-list', '/reading-plan', '/church', '/two-step',
  '/account-security', '/ai-chat',
];

test('a member walks every screen with every switch on, without a crash, server error or accessibility violation', async ({ page }) => {
  test.setTimeout(600_000);
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
  const problems: string[] = [];
  let here = '';
  page.on('pageerror', (e) => problems.push(`${here}: page error ${e.message.slice(0, 200)}`));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${here}: ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  try {
    await signIn(page, 'ethel');
    const { rows: post } = await db.query<{ id: string }>("select id from public.posts where post_type = 'prayer_request' and moderation_status = 'visible' and community_id = public.default_community_id() order by created_at desc limit 1");
    const { rows: person } = await db.query<{ id: string }>("select id from auth.users where email = 'carol@demo.prayertower.local'");
    const { rows: event } = await db.query<{ id: string }>('select id from public.events where cancelled_at is null order by starts_at desc limit 1');
    const extra = [post[0] && `/post/${post[0].id}`, person[0] && `/people/${person[0].id}`, event[0] && `/event/${event[0].id}`].filter(Boolean) as string[];
    for (const path of [...SCREENS, ...extra]) {
      here = path;
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of violations) problems.push(`${path}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
  }
});
