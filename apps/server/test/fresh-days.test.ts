// Fresh starts on days that matter: up to three of a member's own dates, plus the first days of
// Advent, Lent and Easter for faith wording only. Off by default, and only ever shown on the day.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { easter, freshDay, seasonOn } from '../src/modules/fresh-days/index.js';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set fresh_days_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Fresh-start days', () => {
  it('knows Easter, Ash Wednesday and the first Sunday of Advent', () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(easter(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
    expect(seasonOn('2026-04-05')).toBe('easter');
    expect(seasonOn('2026-02-18')).toBe('lent');
    expect(seasonOn('2026-11-29')).toBe('advent');
    expect(seasonOn('2027-11-28')).toBe('advent');
    expect(seasonOn('2026-10-29')).toBeNull();
  });

  it('is off until switched on, then keeps up to three real dates of the member’s own', async () => {
    const me = await createUser('Fresh Member');
    expect((await as(me).post('/me/fresh-days', { month: 5, day: 12, label: 'My birthday' })).statusCode).toBe(400);
    expect((await as(me).get('/me/prayer-stats?tz=UTC')).json().stats.freshDay).toBeUndefined();
    await on(true);
    expect((await as(me).post('/me/fresh-days', { month: 4, day: 31, label: 'Not a day' })).statusCode).toBe(400);
    const days = (await as(me).post('/me/fresh-days', { month: 2, day: 29, label: 'Leap day' })).json().days;
    expect(days).toHaveLength(1);
    await as(me).post('/me/fresh-days', { month: 5, day: 12, label: 'My birthday' });
    await as(me).post('/me/fresh-days', { month: 9, day: 1, label: 'Sober since' });
    expect((await as(me).post('/me/fresh-days', { month: 9, day: 2, label: 'One more' })).statusCode).toBe(400);
    expect((await as(await createUser('Fresh Other')).delete(`/me/fresh-days/${days[0].id}`)).statusCode).toBe(404);
    expect((await as(me).delete(`/me/fresh-days/${days[0].id}`)).json().days).toHaveLength(2);
    expect(await freshDay(db, me, '2026-05-12')).toEqual({ label: 'My birthday' });
    expect(await freshDay(db, me, '2026-04-05')).toEqual({ season: 'easter' });
    expect(await freshDay(db, me, '2026-05-13')).toBeNull();
    expect((await as(me).get('/me/prayer-stats?tz=UTC')).json().stats).toHaveProperty('freshDay');
  });
});
