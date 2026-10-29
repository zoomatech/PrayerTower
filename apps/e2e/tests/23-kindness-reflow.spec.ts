// Kindness tools at phone width and with wider text spacing: with every switch on, the
// screens that carry the kindness and growth tools reflow at 320 CSS px (WCAG 1.4.10)
// and keep working with WCAG 1.4.12 text spacing, with no sideways scrolling and no
// axe violations. Screen reader names are checked by the unit tests and the axe rules.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { db, signIn } from './helpers';

// WCAG 1.4.12: line height 1.5, paragraph spacing 2, letter spacing 0.12, word spacing 0.16 (in em).
const SPACING = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
p, div[dir] { margin-bottom: 2em; }`;

test.use({ viewport: { width: 320, height: 720 } });

test('kindness screens reflow at 320 px and with wider text spacing, switches on', async ({ page }) => {
  test.setTimeout(300_000);
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
  try {
    await signIn(page, 'ethel');
    const { rows: ethel } = await db.query<{ id: string }>("select id from auth.users where email = 'ethel@demo.prayertower.local'");
    const { rows: other } = await db.query<{ id: string }>(
      "select id from public.posts where post_type = 'prayer_request' and moderation_status = 'visible' and user_id <> $1 and community_id = public.default_community_id() order by created_at desc limit 1",
      [ethel[0]!.id],
    );
    const { rows: own } = await db.query<{ id: string }>(
      "select id from public.posts where post_type = 'prayer_request' and moderation_status = 'visible' and state <> 'answered' and user_id = $1 order by created_at desc limit 1",
      [ethel[0]!.id],
    );
    // A prayer circle with a post and a reply, so its feed has something to lay out.
    const { rows: circle } = await db.query<{ id: string }>("insert into public.prayer_circles (name, about, owner_id) values ('Reflow circle', 'We pray for each other.', $1) returning id", [ethel[0]!.id]);
    await db.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2)', [circle[0]!.id, ethel[0]!.id]);
    const { rows: cp } = await db.query<{ id: string }>("insert into public.circle_posts (circle_id, user_id, body) values ($1, $2, 'Please pray for my sister, who starts a new job on Monday.') returning id", [circle[0]!.id, ethel[0]!.id]);
    await db.query("insert into public.circle_replies (circle_post_id, user_id, body) values ($1, $2, 'Holding her in my heart.')", [cp[0]!.id, ethel[0]!.id]);
    // A circle update, a fresh-start day for today and a weekly aim, so those cards are laid out too.
    await db.query("update public.circle_posts set update_text = 'Her first week went well.', update_at = now(), answered = true where id = $1", [cp[0]!.id]);
    const today = new Date();
    await db.query("insert into public.fresh_start_days (user_id, month, day, label) values ($1, $2, $3, 'reflow day')", [ethel[0]!.id, today.getMonth() + 1, today.getDate()]);
    await db.query('update public.profiles set weekly_intention = 3 where id = $1', [ethel[0]!.id]);
    const expected: Record<string, string[]> = {
      '/profile': ['weekly-intention', 'fresh-days-card', 'fresh-day'],
      [`/circles/${circle[0]!.id}`]: [`circle-update-${cp[0]!.id}`],
    };
    const paths = ['/', '/profile', '/kindness-research', '/meaning-words', '/highlights', '/circles', `/circles/${circle[0]!.id}`, ...[...other, ...own].map((p) => `/post/${p.id}`)];
    for (const spacing of [false, true]) {
      for (const path of paths) {
        const here = `${path}${spacing ? ' (text spacing)' : ''}`;
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        if (spacing) await page.addStyleTag({ content: SPACING });
        for (const id of expected[path] ?? []) {
          if (!(await page.getByTestId(id).first().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false))) problems.push(`${here}: ${id} is missing`);
        }
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) problems.push(`${here}: scrolls sideways by ${overflow}px`);
        const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        for (const v of violations) problems.push(`${here}: ${v.id} (${v.impact}) ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    await db.query("delete from public.fresh_start_days where label = 'reflow day'");
    await db.query("update public.profiles set weekly_intention = null where id = (select id from auth.users where email = 'ethel@demo.prayertower.local')");
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
  }
});
