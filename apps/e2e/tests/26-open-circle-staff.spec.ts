// Open Circle staff walk: an admin whose own community is Open Circle opens every
// staff screen with every feature switch on. The screens may name the faith-only
// features they manage for faith communities (FAITH_ONLY), but no other religious
// wording, and no screen may crash or get a server error.
import { expect, test, type Response } from '@playwright/test';

import { db, DEMO_PASSWORD } from './helpers';

const RELIGIOUS = /\b(pray\w*|god|lord|jesus|christ\w*|bible|psalms?|gospel|ministry|worship\w*|spiritual|church\w*|amen|blessed|scripture|priestly|pastor\w*|testimon\w*|confession\w*|faith|prais\w*)\b/gi;
const SCREENS = [
  '/admin', '/announcements', '/audit-log', '/churches', '/error-log', '/feedback-triage', '/import', '/invites', '/legal', '/macro-needs',
  '/moderation', '/ops', '/podcasts-admin', '/radio-requests', '/surveys', '/waitlist', '/witness', '/operator-console', '/notifications', '/skin-gallery',
];
// Settings for features that only faith communities get (the same list as the app's wording test).
const FAITH_ONLY = /confession|conversation with God|not God|Bible Gateway|faith communit|any faith or none|denomination|Advent|church/i;

test('an Open Circle admin sees no religious wording on staff screens, with every switch on', async ({ page }) => {
  test.setTimeout(300_000);
  await db.query("update public.communities set status = 'active' where slug = 'open-circle'");
  const { rows: user } = await db.query<{ id: string }>("select id from auth.users where email = 'admin@demo.prayertower.local'");
  const admin = user[0]!.id;
  const { rows: memberships } = await db.query<{ community_id: string; is_primary: boolean }>(
    'select community_id, is_primary from public.community_memberships where user_id = $1',
    [admin],
  );
  await db.query('delete from public.community_memberships where user_id = $1', [admin]);
  await db.query("insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'", [admin]);
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
  // What people wrote (survey questions, announcements, community names such as Prayer Tower, names such as Demo Pastor) is theirs, not app wording.
  const { rows: data } = await db.query<{ w: string }>(
    'select title as w from public.surveys union all select intro from public.surveys union all select title from public.announcements union all select body from public.announcements union all select name from public.communities union all select display_name from public.profiles',
  );
  const written = data.map((d) => d.w).filter(Boolean).sort((a, b) => b.length - a.length);
  try {
    // As in 18-open-circle: the feed tab says Support, not Prayers, so the shared signIn can't wait for it.
    await page.addInitScript((key) => window.localStorage.setItem(key, '1'), `tour:seen:v1:${admin}`);
    await page.goto('/sign-in');
    await page.locator('input').nth(0).fill('admin@demo.prayertower.local');
    await page.locator('input[type=password]').fill(DEMO_PASSWORD);
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByText('Support').first()).toBeVisible();
    const found: string[] = [];
    let here = '';
    page.on('pageerror', (e) => found.push(`${here}: page error ${e.message.slice(0, 200)}`));
    page.on('response', (r: Response) => {
      if (r.status() >= 500) found.push(`${here}: ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    for (const path of SCREENS) {
      here = path;
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const labels = await page.locator('[aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
      let text = [await page.locator('body').innerText(), ...labels].join('\n');
      for (const w of written) text = text.split(w).join('');
      // Ids and settings keys in the audit log (prayerful_helper, christian-ecumenical) are data, not wording.
      text = text.replace(/\b\w+[_-]\w+[\w-]*\b/g, '');
      const hits = text.split('\n').filter((l) => l.match(RELIGIOUS) && !l.includes('[Demo]') && !FAITH_ONLY.test(l) && !l.includes('@demo.prayertower.local'));
      if (hits.length) found.push(`${path}: ${[...new Set(hits.map((l) => l.trim().slice(0, 120)))].join(' | ')}`);
    }
    expect(found, found.join('\n')).toEqual([]);
  } finally {
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
    await db.query('delete from public.community_memberships where user_id = $1', [admin]);
    for (const m of memberships) await db.query('insert into public.community_memberships (community_id, user_id, is_primary) values ($1, $2, $3)', [m.community_id, admin, m.is_primary]);
  }
});
