// The Common Prayer Fund report. The page switch is one shared row (future.test.ts turns it
// on and off), so the report checks run in a rolled-back transaction.
import { afterAll, describe, expect, it } from 'vitest';
import { grantRole } from '../src/modules/accounts/index.js';
import * as fund from '../src/modules/common-fund/index.js';
import { as, createUser, db } from './helpers.js';

afterAll(async () => {
  await db.end();
});

describe('Common Prayer Fund', () => {
  it('lets only admins record and void entries, and checks direction and source agree', async () => {
    const admin = await createUser('Fund Admin');
    const member = await createUser('Fund Member');
    await grantRole(db, admin, 'admin', null);
    const entry = { direction: 'in', source: 'donation', amountCents: 5000, publicNote: 'A gift from a church' };
    expect((await as(member).post('/admin/common-fund/entries', entry)).statusCode).toBe(403);
    expect((await as(admin).post('/admin/common-fund/entries', { ...entry, source: 'help' })).statusCode).toBe(400);
    expect((await as(admin).post('/admin/common-fund/entries', { ...entry, amountCents: 0 })).statusCode).toBe(400);
    const res = await as(admin).post('/admin/common-fund/entries', entry);
    expect(res.statusCode).toBe(201);
    const id = res.json().entry.id;
    expect((await as(admin).post(`/admin/common-fund/entries/${id}/void`)).json().entry.voided_at).toBeTruthy();
    expect((await as(admin).post(`/admin/common-fund/entries/${id}/void`)).statusCode).toBe(409);
    expect((await as(admin).get('/admin/common-fund/entries')).json().entries.some((e: { id: string }) => e.id === id)).toBe(true);
  });

  it('reports money in, help sent and the balance, leaves voided entries out, and names no one', async () => {
    const admin = await createUser('Fund Admin');
    const c = await db.connect();
    try {
      await c.query('begin');
      await c.query('delete from public.common_fund_entries');
      await c.query('update public.future_settings set common_fund_page_enabled = false');
      expect(await fund.report(c)).toEqual({ enabled: false });
      await c.query('update public.future_settings set common_fund_page_enabled = true');

      await fund.record(c, admin, { direction: 'in', source: 'purchase_share', amountCents: 12000 });
      await fund.record(c, admin, { direction: 'in', source: 'donation', amountCents: 3000, publicNote: 'In memory of a friend' });
      await fund.record(c, admin, { direction: 'out', source: 'help', amountCents: 4500, helpKind: 'Groceries' });
      await fund.record(c, admin, { direction: 'out', source: 'help', amountCents: 500, helpKind: 'groceries' });
      const oops = await fund.record(c, admin, { direction: 'out', source: 'help', amountCents: 99900, helpKind: 'rent' });
      await fund.voidEntry(c, admin, oops.id);

      const r = await fund.report(c);
      if (!r.enabled) throw new Error('expected the report');
      expect(r.totals).toEqual({ inCents: 15000, outCents: 5000, balanceCents: 10000 });
      expect(r.months).toHaveLength(1);
      expect(r.helpByKind).toEqual([{ kind: 'groceries', times: 2, cents: 5000 }]);
      expect(r.recent.map((x) => x.label)).toContain('Help sent: Groceries');
      expect(r.recent.find((x) => x.note)?.note).toBe('In memory of a friend');
      const html = fund.reportHtml(r, (s) => s);
      expect(html).toContain('$100.00');
      expect(html).not.toContain('Fund Admin');
    } finally {
      await c.query('rollback');
      c.release();
    }
  });
});
