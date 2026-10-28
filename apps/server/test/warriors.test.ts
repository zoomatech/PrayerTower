import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('prayer warrior standings', () => {
  it('ranks verified prayers for others, admins only', async () => {
    const admin = await createUser('Standings Admin');
    await grantRole(db, admin, 'admin', null);
    const warrior = await createUser('Faithful Phoebe');
    const a = await newRequest(await createUser('Asker One'), 'Pray for my knee.');
    const b = await newRequest(await createUser('Asker Two'), 'Pray for my shop.');
    await as(warrior).post(`/posts/${a.id}/praying-now`, {});
    // Past the minimum gap, so the second prayer also counts as verified.
    await db.query(`update public.prayer_events set created_at = now() - interval '2 hours' where user_id = $1`, [warrior]);
    await as(warrior).post(`/posts/${b.id}/praying-now`, {});

    expect((await as(warrior).get('/admin/prayer-warriors')).statusCode).toBe(403);
    const { standings } = (await as(admin).get('/admin/prayer-warriors?days=30')).json() as {
      standings: { userId: string; prayers: number; peoplePrayedFor: number }[];
    };
    const me = standings.find((s) => s.userId === warrior);
    expect(me?.peoplePrayedFor).toBe(2);
    expect(me!.prayers).toBeGreaterThanOrEqual(1);
  });
});
