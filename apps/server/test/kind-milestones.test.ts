// Private kindness milestones: only the member sees them, counts only kindness toward
// others, shows the highest level reached, and greets a new one once.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createUser, db, newRequest } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set kind_milestones_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Kindness milestones', () => {
  it('shows nothing while off', async () => {
    const u = await createUser('Mile Off');
    expect((await as(u).get('/me/kind-milestones')).json()).toEqual({ enabled: false, milestones: [] });
  });

  it('counts only kindness toward others, at the highest level reached, new once', async () => {
    await on(true);
    const [me, a, b] = [await createUser('Mile Me'), await createUser('Mile A'), await createUser('Mile B')];
    expect((await as(me).get('/me/kind-milestones')).json()).toEqual({ enabled: true, milestones: [] });
    const own = await newRequest(me);
    await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [own.id, me]);
    expect((await as(me).get('/me/kind-milestones')).json().milestones).toEqual([]);
    for (const who of [a, b]) {
      const p = await newRequest(who);
      await db.query(`insert into public.prayer_events (post_id, user_id, kind) values ($1, $2, 'praying_now')`, [p.id, me]);
    }
    const first = (await as(me).get('/me/kind-milestones')).json().milestones;
    expect(first).toEqual([
      { metric: 'people', level: 1, count: 2, new: true },
      { metric: 'requests', level: 1, count: 2, new: true },
    ]);
    const seen = (await as(me).post('/me/kind-milestones/seen')).json().milestones;
    expect(seen.every((m: { new: boolean }) => !m.new)).toBe(true);
    // Someone else's milestones are theirs alone.
    expect((await as(a).get('/me/kind-milestones')).json().milestones).toEqual([]);
  });
});
