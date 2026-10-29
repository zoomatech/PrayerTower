// Kindness weather report: weekly totals of warm and heated signals for admins, with no
// per-member numbers, and quiet weeks folded so no one can be picked out.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skyFor } from '../src/modules/kindness-weather/index.js';
import { as, createUser, db } from './helpers.js';

const on = (v: boolean) => db.query('update public.practice_settings set kindness_weather_enabled = $1', [v]);

beforeAll(() => on(false));
afterAll(async () => {
  await on(false);
  await db.end();
});

describe('Kindness weather', () => {
  it('reads the sky from heat per comment', () => {
    expect(skyFor(4, 4, 0)).toBe('quiet');
    expect(skyFor(100, 20, 1)).toBe('sunny');
    expect(skyFor(100, 2, 1)).toBe('fair');
    expect(skyFor(100, 2, 8)).toBe('cloudy');
    expect(skyFor(100, 50, 20)).toBe('stormy');
  });

  it('is for admins only, and off until switched on', async () => {
    const [admin, member] = [await createUser('Weather Admin'), await createUser('Weather Member')];
    await db.query(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [admin]);
    expect((await as(member).get('/admin/kindness-weather')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/kindness-weather')).json()).toEqual({ enabled: false, weeks: [] });
    await on(true);
    const r = (await as(admin).get('/admin/kindness-weather?weeks=4')).json();
    expect(r.enabled).toBe(true);
    expect(r.weeks).toHaveLength(4);
    for (const w of r.weeks) {
      expect(Object.keys(w).sort()).toEqual(['comments', 'heated', 'people', 'prayers', 'warm', 'weather', 'weekStart']);
      if (w.weather === 'quiet') expect(w.people).toBeNull();
      else expect(w.people).toBeLessThanOrEqual(w.comments);
    }
  });

  it('switches the kind words practice card on and off', async () => {
    const member = await createUser('Kind Words Member');
    const set = (v: boolean) => db.query('update public.practice_settings set empathy_practice_enabled = $1', [v]);
    await set(false);
    expect((await as(member).get('/features')).json().features.empathyPractice).toBe(false);
    await set(true);
    expect((await as(member).get('/features')).json().features.empathyPractice).toBe(true);
    await set(false);
  });
});
