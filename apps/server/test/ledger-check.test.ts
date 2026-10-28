import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import { buildTaskList, crontab } from '../src/tasks.js';
import { findProblems, runCheck } from '../src/modules/tokens/ledger-check.js';
import { as, config, createUser, db } from './helpers.js';

afterAll(() => db.end());

describe('token ledger integrity check', () => {
  it('is scheduled nightly and passes on a healthy ledger', async () => {
    expect(crontab).toMatch(/^15 4 \* \* \* token_ledger_check /m);
    expect(buildTaskList(db, config).token_ledger_check).toBeTypeOf('function');
    expect((await findProblems(db)).problems).toEqual([]);
  });

  it('records each run, alerts every admin on a mismatch, and lets admins run it by hand', async () => {
    const admin = await createUser('Ledger Admin');
    await grantRole(db, admin, 'admin', null);
    const member = await createUser('Ledger Member');
    expect((await as(member).get('/admin/ledger-checks')).statusCode).toBe(403);
    expect((await as(member).post('/admin/ledger-checks')).statusCode).toBe(403);

    const ran = await as(admin).post('/admin/ledger-checks');
    expect(ran.statusCode, ran.body).toBe(200);
    expect(ran.json().check).toMatchObject({ ok: true, problems: [], triggeredBy: admin });
    expect(ran.json().check.accountsChecked).toBeGreaterThan(0);
    expect((await as(admin).get('/admin/ledger-checks')).json().checks[0].id).toBe(ran.json().check.id);

    // Break a cached balance inside a transaction that is rolled back, so no other test sees it.
    const { rows: acct } = await db.query<{ id: string }>(`select public.token_user_account($1) as id`, [member]);
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query('update public.token_accounts set balance = balance + 5 where id = $1', [acct[0]!.id]);
      const check = await runCheck(client);
      expect(check.ok).toBe(false);
      expect(check.problems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ check: 'balance_mismatch', accountId: acct[0]!.id, balance: '5', derived: '0' }),
          { check: 'currency_total', currency: 'regular', total: '5' },
        ]),
      );
      const { rows: alerts } = await client.query<{ title: string; body: string }>(
        `select title, body from public.notifications where user_id = $1 and kind = 'ledger_alert'`,
        [admin],
      );
      expect(alerts).toEqual([{ title: 'Token ledger check found a problem', body: '2 problems in the token ledger. Open Admin → Tokens for details.' }]);
      // A second run the same day doesn't alert again.
      await runCheck(client);
      expect((await client.query(`select 1 from public.notifications where user_id = $1 and kind = 'ledger_alert'`, [admin])).rows).toHaveLength(1);
    } finally {
      await client.query('rollback');
      client.release();
    }
    expect((await findProblems(db)).problems).toEqual([]);
  });
});
