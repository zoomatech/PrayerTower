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
  '/account-security', '/ai-chat', '/listen', '/remembered', '/tour',
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
  const created: [string, string][] = [];
  let themeBefore: { user: string; theme: string | null } | null = null;
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
    // A mend (gentle repair) waiting for Ethel: Carol's comment on a request, her sorry delivered.
    const { rows: ethel } = await db.query<{ id: string }>("select id from auth.users where email = 'ethel@demo.prayertower.local'");
    const { rows: comment } = await db.query<{ id: string }>(
      "insert into public.comments (post_id, user_id, body) values ($1, $2, 'Pilot walk: a comment to mend') returning id",
      [post[0]!.id, person[0]!.id],
    );
    created.push(['comments', comment[0]!.id]);
    const { rows: mend } = await db.query<{ id: string }>(
      `insert into public.mends (comment_id, hurt_id, author_id, status, what_i_did, on_me, next_time)
       values ($1, $2, $3, 'delivered', 'I spoke too fast.', 'That was on me.', 'I will ask first.') returning id`,
      [comment[0]!.id, ethel[0]!.id, person[0]!.id],
    );
    const extra = [post[0] && `/post/${post[0]!.id}`, person[0] && `/people/${person[0]!.id}`, event[0] && `/event/${event[0].id}`, `/mend/${mend[0]!.id}`].filter(Boolean) as string[];
    // Every feed skin offered in Ethel's community (switches on show the gated ones): the feed and a request under each.
    const { rows: skins } = await db.query<{ id: string; slug: string }>(
      `select t.id, t.slug from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
        where d.community_id = public.default_community_id() and t.status <> 'retired' and t.season is null order by t.slug`,
    );
    const { rows: chosen } = await db.query<{ feed_theme_id: string | null }>('select feed_theme_id from public.community_memberships where user_id = $1 and is_primary', [ethel[0]!.id]);
    themeBefore = { user: ethel[0]!.id, theme: chosen[0]?.feed_theme_id ?? null };
    const visits: { path: string; skin?: { id: string; slug: string } }[] = [...SCREENS, ...extra].map((path) => ({ path }));
    for (const skin of skins) for (const path of ['/', `/post/${post[0]!.id}`]) visits.push({ path, skin });
    for (const { path: target, skin } of visits) {
      if (skin) await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [ethel[0]!.id, skin.id]);
      const path = skin ? `${target} (skin ${skin.slug})` : target;
      here = path;
      await page.goto(target);
      await page.waitForLoadState('networkidle');
      // Skins grow their cards in (blossom, vine); let the motion settle so axe measures where targets land.
      await page.waitForTimeout(skin ? 2000 : 500);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      for (const v of violations) problems.push(`${path}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    for (const [table, id] of created) await db.query(`delete from public.${table} where id = $1`, [id]);
    if (themeBefore) await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [themeBefore.user, themeBefore.theme]);
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
  }
});
