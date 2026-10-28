// Equal material help for paid radio prayers, off by default. Its switch and the
// radio settings are shared rows, so the "on" cases run in a transaction that is rolled back.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as materialMatch from '../src/modules/material-match/index.js';
import * as radio from '../src/modules/radio/index.js';
import * as tokens from '../src/modules/tokens/index.js';
import { as, createUser, db, newRequest } from './helpers.js';

afterAll(() => db.end());

describe('Equal material help', () => {
  it('is off by default and admin-only', async () => {
    const admin = await createUser('Match Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Match Member');
    expect((await as(member).get('/admin/material-match')).statusCode).toBe(403);
    expect((await as(admin).get('/admin/material-match')).json().settings).toEqual({ enabled: false, centsPerToken: 100 });
    expect((await as(member).get('/features')).json().features.materialMatch).toBe(false);
  });

  it('when on, owes equal help for each paid radio prayer, cancels it on a refund, and records it in the fund when sent', async () => {
    const [admin, poster, sender] = [await createUser('Fund Admin'), await createUser('Afflicted Ann'), await createUser('Radio Ray')];
    await grantRole(db, admin, 'admin', null);
    const post = await newRequest(poster, 'Please pray for our family after the flood.');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.token_settings set radio_funding = 'tokens', radio_prayer_cost = 2`);
      await materialMatch.updateSettings(c, { enabled: true, centsPerToken: 250 });
      await tokens.creditPurchase(c, sender, 10, `test:match:${sender}`, 'priestly');

      const first = await radio.queue(c, sender, post.id, `match:1:${post.id}`);
      const second = await radio.queue(c, sender, post.id, `match:2:${post.id}`);
      expect(first.cost).toBe(2);
      let s = await materialMatch.summary(c);
      expect(s.owed).toMatchObject({ count: 2, cents: 1000 });

      // A prayer that never goes out is refunded, and nothing is owed for it.
      await c.query(`update public.radio_prayers set status = 'sending' where id = $1`, [second.id]);
      await radio.reportResult(c, second.id, { ok: false, callSign: 'N0CALL', error: 'antenna down' });
      s = await materialMatch.summary(c);
      expect(s.owed).toMatchObject({ count: 1, cents: 500 });

      const done = await materialMatch.fulfill(c, admin, { helpKind: 'groceries', publicNote: 'Flood relief' });
      expect(done).toMatchObject({ fulfilled: 1, cents: 500 });
      const { rows } = await c.query('select direction, source, amount_cents, help_kind from public.common_fund_entries where id = $1', [done.entryId]);
      expect(rows[0]).toEqual({ direction: 'out', source: 'help', amount_cents: 500, help_kind: 'groceries' });
      expect((await materialMatch.summary(c)).fulfilled).toEqual({ count: 1, cents: 500 });
      await expect(materialMatch.fulfill(c, admin, { helpKind: 'groceries' })).rejects.toThrow('No material help is owed');
    } finally {
      await c.query('rollback');
      c.release();
    }
  });

  it('owes nothing while the switch is off', async () => {
    const [poster, sender] = [await createUser('Off Poster'), await createUser('Off Sender')];
    const post = await newRequest(poster, 'Please pray for my job search.');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query(`update public.token_settings set radio_funding = 'tokens', radio_prayer_cost = 1`);
      await tokens.creditPurchase(c, sender, 5, `test:match-off:${sender}`, 'priestly');
      const rp = await radio.queue(c, sender, post.id, `match-off:${post.id}`);
      const { rowCount } = await c.query('select 1 from public.material_help_matches where radio_prayer_id = $1', [rp.id]);
      expect(rowCount).toBe(0);
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
