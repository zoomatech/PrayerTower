// The "no misleading claims" and "no automated accounts" rules, both off by default.
// The switches are one shared row, so the "on" cases run in a transaction that is rolled back.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as moderation from '../src/modules/moderation/index.js';
import * as notebook from '../src/modules/notebook/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

const CASES = [
  { rule: 'misleading', patch: { misleadingRuleEnabled: true }, feature: 'misleadingRule', title: 'No misleading claims', body: 'This tea cures cancer, skip the doctor.' },
  { rule: 'automation', patch: { automationRuleEnabled: true }, feature: 'automationRule', title: 'No automated accounts', body: 'Auto-post #4812 from my scheduler.' },
] as const;

describe.each(CASES)('$title rule', ({ rule, patch, feature, title, body }) => {
  it('is off by default, and moderators can cite it once an admin turns it on', async () => {
    const [poster, reporter, mod] = [await createUser(`${rule} poster`), await createUser(`${rule} reporter`), await createUser(`${rule} mod`)];
    await grantRole(db, mod, 'moderator', null);
    expect((await as(poster).get('/features')).json().features[feature]).toBe(false);
    const post = await newRequest(poster, body);
    await as(reporter).post('/reports', { targetType: 'post', targetId: post.id, reason: title });
    const item = (await as(mod).get(`/moderation/queue?targetId=${post.id}`)).json().items[0].id as string;
    const refused = await as(mod).post(`/moderation/items/${item}/decision`, { action: 'remove', rule });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().message).toContain('switched off');

    const c = await db.connect();
    try {
      await c.query('begin');
      await notebook.updateSettings(c, patch);
      expect((await notebook.features(c))[feature]).toBe(true);
      await moderation.decide(c, mod, item, { action: 'remove', rule, clawbackTransferIds: [] });
      const { rows } = await c.query<{ body: string }>(`select body from public.notifications where user_id = $1 and kind = 'moderation_notice'`, [poster]);
      expect(rows[0]!.body).toContain(title);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
