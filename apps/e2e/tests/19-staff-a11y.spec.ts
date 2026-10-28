// Every staff screen passes axe WCAG A/AA checks, with each feature switch on so
// the full screen shows (07-accessibility covers admin, the audit log and ops on defaults).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { db, signIn } from './helpers';

const SCREENS = [
  '/admin', '/announcements', '/audit-log', '/churches', '/feedback-triage', '/import', '/invites', '/legal', '/macro-needs',
  '/moderation', '/ops', '/podcasts-admin', '/surveys', '/waitlist', '/witness',
];

test('staff screens have no WCAG A/AA violations, with every switch on', async ({ page }) => {
  test.setTimeout(240_000);
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
  try {
    await signIn(page, 'admin');
    const found: string[] = [];
    for (const path of SCREENS) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of violations) found.push(`${path}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  } finally {
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
  }
});
