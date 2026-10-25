import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { withTx } from '../src/db.js';
import * as tokens from '../src/modules/tokens/index.js';
import { config, createUser, db } from './helpers.js';

afterAll(() => db.end());

async function auditIsClean() {
  const { rows } = await db.query('select * from public.token_ledger_audit');
  expect(rows).toEqual([]);
}

describe('token ledger', () => {
  it('earns and gifts, with balances derived from transfers', async () => {
    const a = await createUser('A');
    const b = await createUser('B');
    await tokens.earn(db, a, 5, `t:${a}:earn`, 'test');
    await withTx(db, (tx) => tokens.gift(tx, a, b, 2, 'g1'));
    expect(await tokens.balanceOf(db, a)).toBe(3);
    expect(await tokens.balanceOf(db, b)).toBe(2);
    await auditIsClean();
  });

  it('never overdraws under concurrent spends', async () => {
    const a = await createUser('Spender');
    const b = await createUser('Receiver');
    await tokens.earn(db, a, 5, `t:${a}:earn`, 'test');
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) => withTx(db, (tx) => tokens.gift(tx, a, b, 1, `spend-${i}`))),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(5);
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as { code: string }).code).toBe('insufficient_tokens');
    }
    expect(await tokens.balanceOf(db, a)).toBe(0);
    expect(await tokens.balanceOf(db, b)).toBe(5);
    await auditIsClean();
  });

  it('treats duplicate clicks with the same key as one transfer', async () => {
    const a = await createUser('Clicker');
    const b = await createUser('Target');
    await tokens.earn(db, a, 10, `t:${a}:earn`, 'test');
    const results = await Promise.all(Array.from({ length: 8 }, () => withTx(db, (tx) => tokens.gift(tx, a, b, 3, 'same-click'))));
    expect(new Set(results.map((t) => t.id)).size).toBe(1);
    expect(await tokens.balanceOf(db, a)).toBe(7);
    expect(await tokens.balanceOf(db, b)).toBe(3);
  });

  it('rejects a reused key with different details', async () => {
    const a = await createUser('Reuser');
    const b = await createUser('Other');
    await tokens.earn(db, a, 10, `t:${a}:earn`, 'test');
    await tokens.gift(db, a, b, 1, 'k');
    await expect(tokens.gift(db, a, b, 2, 'k')).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  it('claws back a transfer exactly once and restores balances', async () => {
    const mod = await createUser('Moderator');
    const a = await createUser('Giver');
    const b = await createUser('Getter');
    await tokens.earn(db, a, 4, `t:${a}:earn`, 'test');
    const gift = await tokens.gift(db, a, b, 4, 'to-clawback');
    const reversal = await tokens.clawback(db, gift.id, mod, 'ad ban');
    expect(reversal.reverses_transfer_id).toBe(gift.id);
    expect(await tokens.balanceOf(db, a)).toBe(4);
    expect(await tokens.balanceOf(db, b)).toBe(0);
    // Repeating returns the same reversal; it never reverses twice.
    expect((await tokens.clawback(db, gift.id, mod, 'again')).id).toBe(reversal.id);
    expect(await tokens.balanceOf(db, a)).toBe(4);
    await expect(tokens.clawback(db, reversal.id, mod, 'nope')).rejects.toMatchObject({ statusCode: 400 });
    await auditIsClean();
  });

  it('refuses a clawback that would overdraw the recipient', async () => {
    const mod = await createUser('Mod2');
    const a = await createUser('G2');
    const b = await createUser('R2');
    const c = await createUser('R3');
    await tokens.earn(db, a, 3, `t:${a}:earn`, 'test');
    const gift = await tokens.gift(db, a, b, 3, 'x');
    await tokens.gift(db, b, c, 3, 'spent-it');
    await expect(tokens.clawback(db, gift.id, mod, 'late')).rejects.toMatchObject({ code: 'insufficient_tokens' });
  });

  it('is append-only', async () => {
    const a = await createUser('Immutable');
    const t = await tokens.earn(db, a, 1, `t:${a}:earn`, 'test');
    await expect(db.query('update public.token_transfers set amount = 100 where id = $1', [t.id])).rejects.toThrow(/append-only/);
    await expect(db.query('delete from public.token_transfers where id = $1', [t.id])).rejects.toThrow(/append-only/);
  });

  it('is closed to Supabase client roles', async () => {
    const client = new pg.Client({ connectionString: config.DATABASE_URL });
    await client.connect();
    try {
      await client.query('set role authenticated');
      await expect(client.query('select * from public.token_transfers')).rejects.toThrow(/permission denied/);
      await expect(
        client.query(`select public.post_token_transfer('x', 'earn', gen_random_uuid(), gen_random_uuid(), 1)`),
      ).rejects.toThrow(/permission denied/);
      await expect(client.query('select * from public.profiles')).rejects.toThrow(/permission denied/);
    } finally {
      await client.end();
    }
  });
});
