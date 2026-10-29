// The reply-prompts-by-kind switch: off by default, an admin turns it on, and /features says so.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.query('update public.conversation_settings set type_prompts_enabled = false');
  await db.end();
});

describe('Reply prompts by kind of post', () => {
  it('is off until an admin turns it on', async () => {
    const admin = await createUser('Pairs Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Pairs Member');
    expect((await as(member).get('/features')).json().features.typePrompts).toBe(false);
    expect((await as(admin).patch('/admin/conversation-settings', { typePromptsEnabled: true })).statusCode).toBe(200);
    expect((await as(member).get('/features')).json().features.typePrompts).toBe(true);
  });
});
