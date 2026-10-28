// Performance pass: every single-column foreign key has an index that leads with
// it (migration 20261029009400_index_foreign_keys.sql), so new tables keep one too.
import { afterAll, describe, expect, it } from 'vitest';
import { db } from './helpers.js';

afterAll(() => db.end());

describe('foreign key indexes', () => {
  it('has an index on every single-column foreign key', async () => {
    const { rows } = await db.query(
      `select c.conrelid::regclass::text as tbl, a.attname as col
         from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace and array_length(c.conkey, 1) = 1
          and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`,
    );
    expect(rows).toEqual([]);
  });
});
