// Admin → Safety dashboard (docs/HARMFUL_PRAYERS.md, "Safety dashboard").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as harm from '../src/modules/harm/index.js';
import * as care from '../src/modules/moderator-care/index.js';
import * as oncall from '../src/modules/moderator-care/oncall.js';
import { coverageGaps } from '../src/modules/moderator-care/safety.js';
import { as, createUser, db } from './helpers.js';

const defaults = { harm: await harm.settings(db), care: await care.settings(db), oncall: await oncall.settings(db) };
let admin: string;
let mod: string;

beforeAll(async () => {
  [admin, mod] = [await createUser('Dash Admin'), await createUser('Dash Mod')];
  await grantRole(db, admin, 'admin', null);
  await grantRole(db, mod, 'moderator', null);
  await harm.updateSettings(db, { enabled: true });
});
afterAll(async () => {
  await harm.updateSettings(db, defaults.harm);
  await care.updateSettings(db, defaults.care);
  await oncall.updateSettings(db, defaults.oncall);
  await db.query('delete from public.oncall_shifts where user_id = $1', [mod]);
  await db.end();
});

describe('coverage gaps', () => {
  it('finds the stretches of each day with nobody on call', () => {
    const gaps = coverageGaps([
      { weekday: 1, start_minute: 540, end_minute: 1020 },
      { weekday: 1, start_minute: 960, end_minute: 1320 },
      ...[0, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_minute: 0, end_minute: 1440 })),
    ]);
    expect(gaps).toEqual([
      { weekday: 1, start_minute: 0, end_minute: 540 },
      { weekday: 1, start_minute: 1320, end_minute: 1440 },
    ]);
    expect(coverageGaps([])).toHaveLength(7);
  });
});

describe('safety dashboard', () => {
  it('is off by default and admins only', async () => {
    expect(defaults.care.safety_dashboard_enabled).toBe(false);
    expect((await as(admin).get('/admin/safety-dashboard')).statusCode).toBe(403);
    await care.updateSettings(db, { safety_dashboard_enabled: true, restore_enabled: true });
    expect((await as(mod).get('/admin/safety-dashboard')).statusCode).toBe(403);
  });

  it('shows held posts, response times, alerts, restores and rota gaps', async () => {
    await oncall.updateSettings(db, { enabled: true, max_wait_minutes: 60 });
    await oncall.addShift(db, admin, { userId: mod, weekday: 2, startMinute: 540, endMinute: 1020 });
    const member = await createUser('Dash Member');
    const held = (await as(member).post('/posts', { postType: 'prayer_request', body: "I'm going to hurt him, I mean it." })).json().post;
    const restored = (await as(member).post('/posts', { postType: 'prayer_request', body: "I'm going to hurt that man for this." })).json().post;
    const item = (await as(mod).get(`/moderation/queue?targetId=${restored.id}`)).json().items.find((i: { source: string }) => i.source === 'harm');
    expect((await as(mod).post(`/moderation/items/${item.id}/decision`, { action: 'dismiss' })).statusCode).toBe(200);

    const d = (await as(admin).get('/admin/safety-dashboard?days=7')).json().dashboard;
    expect(d.maxWaitMinutes).toBe(60);
    expect(d.held.find((h: { source: string }) => h.source === 'harm').held).toBeGreaterThan(0);
    expect(d.response.decided).toBeGreaterThan(0);
    expect(d.response.within_limit).toBeGreaterThan(0);
    expect(d.restores.find((r: { moderator: string }) => r.moderator === 'Dash Mod')?.restores).toBe(1);
    expect(d.rota).toMatchObject({ enabled: true });
    expect(d.rota.gaps.some((g: { weekday: number; start_minute: number }) => g.weekday === 2 && g.start_minute === 0)).toBe(true);
    // Counts and staff names only: no member text anywhere.
    expect(JSON.stringify(d)).not.toContain('hurt');
    expect(held.id).toBeTruthy();
  });
});
