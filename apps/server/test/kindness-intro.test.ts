// The kindness tools intro switch: off by default, an admin turns it on, and /features says so.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.practice_settings set kindness_intro_enabled = false');
  await db.end();
});

describe('Kindness tools intro', () => {
  it('is off until an admin turns it on', async () => {
    const admin = await createUser('Intro Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Intro Member');
    expect((await as(member).get('/features')).json().features.kindnessIntro).toBe(false);
    const r = await as(admin).patch('/admin/practice-settings', { kindnessIntroEnabled: true });
    expect(r.json().settings.kindness_intro_enabled).toBe(true);
    expect((await as(member).get('/features')).json().features.kindnessIntro).toBe(true);
  });
});
