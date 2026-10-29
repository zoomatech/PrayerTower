// Speed check (profiling only, one member, no load): how long the app takes to
// show the feed, and how smooth the feed scrolls under every feed skin, with
// every feature switch on. The phone's slower CPU is approximated with Chrome's
// 4x CPU throttle. Runs only with E2E_SPEED=1; prints a table and writes
// test-results/speed.json. See docs/SPEED.md.
import fs from 'node:fs';

import { test, type Page } from '@playwright/test';

import { db, signIn } from './helpers';

test.skip(!process.env.E2E_SPEED, 'Set E2E_SPEED=1 to run the speed check');

type Row = { skin: string; firstCardMs: number; requests: number; p95FrameMs: number; slowFrames: number; frames: number; longTaskMs: number };

async function measureScroll(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number; __stop: boolean };
    w.__frames = [];
    w.__long = 0;
    w.__stop = false;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__long += e.duration))).observe({ type: 'longtask', buffered: false });
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(200, 400);
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(60);
  }
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(60);
  }
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __long: number; __stop: boolean };
    w.__stop = true;
    const f = w.__frames.slice(1).sort((a, b) => a - b);
    return {
      frames: f.length,
      p95FrameMs: Math.round(f[Math.floor(f.length * 0.95)] ?? 0),
      slowFrames: f.filter((x) => x > 34).length,
      longTaskMs: Math.round(w.__long),
    };
  });
}

test('feed start-up and scrolling under every skin', async ({ page }) => {
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
  const rows: Row[] = [];
  try {
    await signIn(page, 'ethel');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.E2E_SPEED_CPU ?? 4) });
    const { rows: skins } = await db.query<{ id: string | null; slug: string }>(
      `select null::uuid as id, 'none' as slug union all
       select t.id, t.slug from public.community_feed_themes d join public.feed_themes t on t.id = d.theme_id
        where d.community_id = public.default_community_id() and t.status <> 'retired' and t.season is null`,
    );
    for (const skin of skins) {
      await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [ethel[0]!.id, skin.id]);
      let requests = 0;
      const count = () => requests++;
      page.on('request', count);
      const start = Date.now();
      await page.goto('/');
      // A card's action row, or the tower skin's climbing controls (it shows one request at a time).
      await page.getByText(/^(Praying Now|Climb up)$/).first().waitFor({ timeout: 60_000 });
      const firstCardMs = Date.now() - start;
      await page.waitForTimeout(1500);
      page.off('request', count);
      const scroll = await measureScroll(page);
      rows.push({ skin: skin.slug, firstCardMs, requests, ...scroll });
    }
  } finally {
    console.table(rows);
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync('test-results/speed.json', JSON.stringify(rows, null, 2));
    for (const s of before) await db.query(`update public.${s.t} set ${s.c} = $1`, [s.v]);
    await db.query('update public.community_memberships set feed_theme_id = $2 where user_id = $1 and is_primary', [ethel[0]!.id, chosen[0]?.feed_theme_id ?? null]);
  }
});
