// Parallels and reading plans for Text search (docs/LIBRARY_SEARCH.md): both off by default; parallels show
// curated passages side by side with citations, without the Bible in Open Circle; reading plans are read at
// the member's own pace, can be read with a circle, and remind gently once in the evening.
import type { JobHelpers } from 'graphile-worker';
import type { PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as parallels from '../src/modules/library/parallels.js';
import * as plans from '../src/modules/library/plans.js';
import { as, createUser, db } from './helpers.js';

const helpers = {
  logger: { warn: () => undefined },
  withPgClient: async <T>(fn: (c: PoolClient) => Promise<T>) => {
    const c = await db.connect();
    try {
      return await fn(c);
    } finally {
      c.release();
    }
  },
} as unknown as JobHelpers;

const switches = (on: boolean) => db.query('update public.library_settings set enabled = $1, parallels_enabled = $1, plans_enabled = $1', [on]);

afterAll(async () => {
  await switches(false);
  await db.end();
});

/** Runs a check as a member of Open Circle, rolled back afterwards. */
async function inOpenCircle(member: string, check: (c: PoolClient) => Promise<void>) {
  const c = await db.connect();
  try {
    await c.query('begin');
    await c.query(`update public.communities set status = 'active' where slug = 'open-circle'`);
    await c.query('delete from public.community_memberships where user_id = $1', [member]);
    await c.query(`insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`, [member]);
    await check(c);
  } finally {
    await c.query('rollback');
    c.release();
  }
}

describe('parallels', () => {
  it('finds every curated passage in its collection', () => {
    for (const t of parallels.themeSpecs()) for (const s of t.sides) expect(parallels.locate(s), `${t.id}: ${s.ref ?? s.find}`).toBeGreaterThanOrEqual(0);
  });

  it('is off by default, then shows the flood side by side with citations', async () => {
    const member = await createUser('Parallels Reader');
    await switches(false);
    expect((await as(member).get('/library/parallels')).json()).toEqual({ enabled: false });
    expect((await as(member).get('/library/parallels/flood')).statusCode).toBe(403);

    await switches(true);
    const list = (await as(member).get('/library/parallels')).json();
    expect(list.themes.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining(['flood', 'creation', 'eye-for-eye', 'golden-rule']));
    const flood = (await as(member).get('/library/parallels/flood')).json();
    expect(flood.sides[0]).toMatchObject({ collection: 'bible-kjv', citation: 'Genesis 6:13–14 (King James Bible)', label: 'Noah is told to build the ark' });
    const dove = flood.sides.find((s: { ref: string }) => s.ref === 'Tablet XI, lines 142–155');
    expect(dove.text).toMatch(/I brought out a dove/);
    expect(dove.citation).toBe('The Babylonian Story of the Deluge (Gilgamesh), Tablet XI, lines 142–155 (E. A. Wallis Budge (1920))');
    const eye = (await as(member).get('/library/parallels/eye-for-eye')).json();
    expect(eye.sides.find((s: { ref: string }) => s.ref === '§ 196').text).toBe('If a man destroy the eye of another man, they shall destroy his eye.');
    expect((await as(member).get('/library/parallels/nothing-here')).statusCode).toBe(404);
  });

  it('leaves the Bible out in Open Circle and shows only themes with two texts left', async () => {
    const member = await createUser('Parallels Secular');
    await switches(true);
    await inOpenCircle(member, async (c) => {
      const list = await parallels.list(c, member);
      expect(list.enabled && list.themes.map((t) => t.id)).toEqual(['flood', 'creation', 'return-good']);
      const flood = await parallels.theme(c, member, 'flood');
      expect(flood.sides.some((s) => s.collection === 'bible-kjv')).toBe(false);
      await expect(parallels.theme(c, member, 'eye-for-eye')).rejects.toThrow(/not found/i);
    });
  });
});

describe('reading plans', () => {
  it('works out every plan into days', () => {
    const days = Object.fromEntries(plans.planSpecs().map((p) => [p.id, plans.planDays(p).length]));
    expect(days).toEqual({ 'oldest-30': 30, 'wisdom-east-30': 30, 'gospels-89': 89, 'psalms-30': 30, 'proverbs-31': 31 });
  });

  it('is off by default, then a member follows a plan at their own pace', async () => {
    const member = await createUser('Plan Reader');
    await switches(false);
    expect((await as(member).get('/library/plans')).json()).toEqual({ enabled: false });
    expect((await as(member).put('/library/plans/gospels-89/follow', {})).statusCode).toBe(403);

    await switches(true);
    const list = (await as(member).get('/library/plans')).json();
    expect(list.plans.find((p: { id: string }) => p.id === 'gospels-89')).toMatchObject({ days: 89, faith: true, following: null });
    expect((await as(member).post('/library/plans/gospels-89/days/1/read', {})).statusCode).toBe(400);

    await as(member).put('/library/plans/gospels-89/follow', {});
    const one = (await as(member).get('/library/plans/gospels-89/days/1')).json();
    expect(one).toMatchObject({ day: 1, read: false, reading: { citation: 'Matthew 1 (King James Bible)' }, following: { read: 0, next: 1 } });
    expect(one.reading.text).toMatch(/^The book of the generation of Jesus Christ/);
    const read = (await as(member).post('/library/plans/gospels-89/days/1/read', {})).json();
    expect(read).toMatchObject({ read: true, following: { read: 1, next: 2, finished: false } });
    // Reading ahead is fine; the next day is the first one not read.
    await as(member).post('/library/plans/gospels-89/days/3/read', {});
    expect((await as(member).get('/library/plans')).json().plans.find((p: { id: string }) => p.id === 'gospels-89').following).toMatchObject({ read: 2, next: 2 });
    expect((await as(member).get('/library/plans/gospels-89/days/90')).statusCode).toBe(404);

    const after = (await as(member).delete('/library/plans/gospels-89/follow')).json();
    expect(after.plans.find((p: { id: string }) => p.id === 'gospels-89').following).toBeNull();
  });

  it('reads a plan together with a circle', async () => {
    const [a, b, stranger] = [await createUser('Plan Circle A'), await createUser('Plan Circle B'), await createUser('Plan Stranger')];
    await switches(true);
    const { rows } = await db.query<{ id: string }>(`insert into public.prayer_circles (name, owner_id) values ('Morning readers', $1) returning id`, [a]);
    const circle = rows[0]!.id;
    await db.query('insert into public.prayer_circle_members (circle_id, user_id) values ($1, $2), ($1, $3)', [circle, a, b]);

    expect((await as(stranger).put('/library/plans/psalms-30/follow', { circleId: circle })).statusCode).toBe(400);
    await as(a).put('/library/plans/psalms-30/follow', { circleId: circle });
    const seen = (await as(b).get('/library/plans')).json();
    expect(seen.circles).toEqual([{ id: circle, name: 'Morning readers' }]);
    expect(seen.plans.find((p: { id: string }) => p.id === 'psalms-30').circles).toEqual([{ id: circle, name: 'Morning readers', readers: 1 }]);

    await as(b).put('/library/plans/psalms-30/follow', { circleId: circle });
    await as(a).post('/library/plans/psalms-30/days/1/read', {});
    const day = (await as(b).get('/library/plans/psalms-30/days/1')).json();
    expect(day).toMatchObject({ reading: { citation: 'Psalms 1–5 (King James Bible)' }, circle: { id: circle, name: 'Morning readers', readers: 1, reading: 2 } });
  });

  it('offers Open Circle only the plans without the Bible', async () => {
    const member = await createUser('Plan Secular');
    await switches(true);
    await inOpenCircle(member, async (c) => {
      const list = await plans.list(c, member);
      expect(list.enabled && list.plans.map((p) => p.id)).toEqual(['oldest-30', 'wisdom-east-30']);
      await expect(plans.follow(c, member, 'gospels-89', {})).rejects.toThrow(/not found/i);
    });
  });

  it('reminds once in the evening, only on a day nothing was read', async () => {
    const member = await createUser('Plan Reminder');
    await switches(true);
    await as(member).put('/library/plans/proverbs-31/follow', {});
    // A time zone where it is now 8 pm (Etc/GMT-N is N hours ahead of UTC).
    const ahead = (20 - new Date().getUTCHours() + 24) % 24;
    const zone = ahead === 0 ? 'UTC' : ahead <= 14 ? `Etc/GMT-${ahead}` : `Etc/GMT+${24 - ahead}`;
    await db.query(`insert into public.daily_reminders (user_id, hour, minute, time_zone, next_at) values ($1, 9, 0, $2, now() + interval '1 day')`, [member, zone]);
    const notices = async () =>
      (await db.query<{ title: string; body: string }>(`select title, body from public.notifications where user_id = $1 and kind = 'library_plan_reminder'`, [member])).rows;

    await plans.reminderTask()({}, helpers);
    expect(await notices()).toEqual([{ title: 'Proverbs in a month', body: 'Day 1 is ready whenever you are.' }]);
    await plans.reminderTask()({}, helpers);
    expect(await notices()).toHaveLength(1);

    // A day with reading gets no reminder.
    await db.query('update public.library_plan_follows set last_reminded_on = null where user_id = $1', [member]);
    await db.query(`delete from public.notifications where user_id = $1 and kind = 'library_plan_reminder'`, [member]);
    await as(member).post('/library/plans/proverbs-31/days/1/read', {});
    await plans.reminderTask()({}, helpers);
    expect(await notices()).toEqual([]);
  });
});
