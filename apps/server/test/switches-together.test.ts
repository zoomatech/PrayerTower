// How the kindness switches work together. Each case runs inside a transaction that is rolled
// back, so other test files running at the same time never see a switch move.
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { withHistory } from '../src/modules/goldfish/index.js';
import { apply } from '../src/modules/kindness-starter/index.js';
import { health, report } from '../src/modules/kindness-weather/index.js';
import { pending } from '../src/modules/moderation/index.js';
import { features } from '../src/modules/notebook/index.js';
import * as circles from '../src/modules/prayer-circles/index.js';
import { prayerStats } from '../src/modules/prayer-stats/index.js';
import { createUser, db } from './helpers.js';

afterAll(() => db.end());

async function inTx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await db.connect();
  try {
    await c.query('begin');
    return await fn(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

/** Every boolean `*_enabled` column on every settings table. */
async function allSwitches(c: PoolClient) {
  const { rows } = await c.query<{ t: string; col: string }>(
    `select table_name as t, column_name as col from information_schema.columns
      where table_schema = 'public' and data_type = 'boolean' and table_name like '%settings' and column_name like '%enabled'`,
  );
  return rows;
}
const set = (c: PoolClient, table: string, cols: Record<string, boolean>) =>
  c.query(`update public.${table} set ${Object.keys(cols).map((k, i) => `${k} = $${i + 1}`).join(', ')}`, Object.values(cols));

describe('Kindness switches together', () => {
  it('works with every switch on at once', async () => {
    const me = await createUser('All On Member');
    await inTx(async (c) => {
      for (const s of await allSwitches(c)) await c.query(`update public.${s.t} set ${s.col} = true`);
      const f = await features(c);
      expect(f).toMatchObject({ prayerCircles: true, circleWelcome: true, circleUpdates: true, encourager: true, encouragerCheckin: true, goldfishMemory: true, weeklyIntention: true, freshDays: true });
      const stats = await prayerStats(c, me, 'UTC');
      expect(stats.intention).toBeDefined();
      expect(stats).toHaveProperty('freshDay');
      expect((await report(c, 4)).enabled).toBe(true);
      expect((await health(c, 4)).enabled).toBe(true);
      const queue = await withHistory(c, (await pending(c, 20)) as { user_id: string | null }[]);
      expect(Array.isArray(queue)).toBe(true);
    });
  });

  it('keeps a dependent switch off while the switch it needs is off', async () => {
    await inTx(async (c) => {
      await set(c, 'practice_settings', { prayer_circles_enabled: false, circle_welcome_enabled: true, circle_updates_enabled: true, encourager_enabled: false, encourager_checkin_enabled: true });
      expect(await features(c)).toMatchObject({ prayerCircles: false, circleWelcome: false, circleUpdates: false, encourager: false, encouragerCheckin: false });
      await set(c, 'practice_settings', { prayer_circles_enabled: true, encourager_enabled: true });
      expect(await features(c)).toMatchObject({ circleWelcome: true, circleUpdates: true, encouragerCheckin: true });
    });
  });

  it('refuses a circle update once circles are switched off, even with updates on', async () => {
    const me = await createUser('Circle Off Member');
    await inTx(async (c) => {
      await set(c, 'practice_settings', { prayer_circles_enabled: true, circle_updates_enabled: true });
      const { id } = await circles.create(c, me, { name: 'Switch test' });
      const post = await circles.post(c, me, id, 'Please keep my week in mind.');
      expect(await circles.update(c, me, post.id, { text: 'Going better.', answered: false })).toEqual({ ok: true });
      await set(c, 'practice_settings', { prayer_circles_enabled: false });
      await expect(circles.update(c, me, post.id, { text: 'Again.', answered: false })).rejects.toThrow();
    });
  });

  it('leaves the circles and encourager switches alone when the starter set goes on and off', async () => {
    await inTx(async (c) => {
      await set(c, 'practice_settings', { prayer_circles_enabled: false, encourager_enabled: false, circle_updates_enabled: false });
      await apply(c, true);
      expect(await features(c)).toMatchObject({ prayerCircles: false, encourager: false, circleUpdates: false, kindCloud: true });
      await set(c, 'practice_settings', { prayer_circles_enabled: true });
      await apply(c, false);
      expect(await features(c)).toMatchObject({ prayerCircles: true, kindCloud: false, weeklyIntention: false });
    });
  });
});
