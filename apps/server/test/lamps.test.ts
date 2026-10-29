// Lamp awards: thanks with a note, recognition only (no tokens), off by default,
// capped per giver each week, within one community.
import { afterAll, describe, expect, it } from 'vitest';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.notebook_settings set lamps_enabled = false, lamps_per_week = 3');
  await db.end();
});

describe('Lamp awards', () => {
  it('lets a member thank another with a note, once a week each, up to the weekly cap', async () => {
    const giver = await createUser('Lamp Giver');
    const [a, b, c] = [await createUser('Lamp One'), await createUser('Lamp Two'), await createUser('Lamp Three')];
    expect((await as(giver).get(`/people/${a}/lamps`)).json()).toMatchObject({ enabled: false });
    expect((await as(giver).post(`/people/${a}/lamps`, { note: 'Thank you' })).statusCode).toBe(403);

    await db.query('update public.notebook_settings set lamps_enabled = true, lamps_per_week = 2');
    const balance = await tokens.balanceOf(db, a);
    expect((await as(giver).post(`/people/${a}/lamps`, { note: 'You prayed with me every day.' })).statusCode).toBe(201);
    expect((await as(giver).post(`/people/${a}/lamps`, { note: 'Again' })).statusCode).toBe(409);
    expect((await as(giver).post(`/people/${giver}/lamps`, { note: 'Me' })).statusCode).toBe(400);
    expect((await as(giver).post(`/people/${b}/lamps`, { note: 'See https://shop.example' })).statusCode).toBe(400);
    expect((await as(giver).post(`/people/${b}/lamps`, { note: 'Thank you for the meal.' })).statusCode).toBe(201);
    const capped = await as(giver).post(`/people/${c}/lamps`, { note: 'Thanks' });
    expect(capped.statusCode).toBe(429);

    const seen = (await as(b).get(`/people/${a}/lamps`)).json();
    expect(seen).toMatchObject({ enabled: true, count: 1, canGive: true });
    expect(seen.lamps[0]).toMatchObject({ note: 'You prayed with me every day.', giverName: 'Lamp Giver' });
    expect((await as(giver).get(`/people/${a}/lamps`)).json().leftThisWeek).toBe(0);
    // Recognition only: no tokens move.
    expect(await tokens.balanceOf(db, a)).toBe(balance);
    // The recipient is told.
    const { rows } = await db.query(`select title, body from public.notifications where user_id = $1 and kind = 'lamp'`, [a]);
    expect(rows[0]).toMatchObject({ title: 'Lamp Giver gave you a lamp', body: 'You prayed with me every day.' });
  });

  it('stays inside one community', async () => {
    await db.query('update public.notebook_settings set lamps_enabled = true');
    const giver = await createUser('Lamp Faith');
    const circle = await createUser('Lamp Circle');
    await db.query('delete from public.community_memberships where user_id = $1', [circle]);
    await db.query(
      `insert into public.community_memberships (community_id, user_id, is_primary) select id, $1, true from public.communities where slug = 'open-circle'`,
      [circle],
    );
    expect((await as(giver).post(`/people/${circle}/lamps`, { note: 'Hi' })).statusCode).toBe(404);
    expect((await as(giver).get(`/people/${circle}/lamps`)).statusCode).toBe(404);
  });
});
