// Kindness starter set: one admin tap turns a short list of kindness tools on, another turns
// them off; members can't; every switch in it is off by default.
import { afterAll, describe, expect, it } from 'vitest';
import { apply, STARTER } from '../src/modules/kindness-starter/index.js';
import { features } from '../src/modules/notebook/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('Kindness starter set', () => {
  it('only lists switches that exist and default to off', async () => {
    for (const [table, column] of STARTER) {
      const { rows } = await db.query<{ d: string | null }>(
        'select column_default as d from information_schema.columns where table_schema = $1 and table_name = $2 and column_name = $3',
        ['public', table, column],
      );
      expect(rows[0]?.d, `${table}.${column}`).toBe('false');
    }
  });

  // Inside a rolled-back transaction, so other test files running at the same time never see the switches move.
  it('turns the whole set on and off together', async () => {
    const c = await db.connect();
    try {
      await c.query('begin');
      const on = await apply(c, true);
      expect(on).toMatchObject({ allOn: true, anyOn: true });
      expect(on.items).toHaveLength(STARTER.length);
      expect(await features(c)).toMatchObject({ kindCloud: true, weeklyIntention: true, goldfishMemory: true });
      expect(await apply(c, false)).toMatchObject({ allOn: false, anyOn: false });
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('is for admins only', async () => {
    const [admin, member] = [await createUser('Starter Admin'), await createUser('Starter Member')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    expect((await as(member).post('/admin/kindness-starter', { on: true })).statusCode).toBe(403);
    expect((await as(member).get('/admin/kindness-starter')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/kindness-starter')).json().items).toHaveLength(STARTER.length);
  });
});
