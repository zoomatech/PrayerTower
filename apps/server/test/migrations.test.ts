import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Supabase keys each migration by the number before the first underscore, so two
// files with the same number stop `supabase db reset` and `db push` (it happened
// once when two threads each added 20261029017100).
describe('migrations', () => {
  it('each has its own version number', () => {
    const versions = readdirSync(new URL('../../../supabase/migrations', import.meta.url))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => f.split('_')[0]);
    const repeated = versions.filter((v, i) => versions.indexOf(v) !== i);
    expect(repeated).toEqual([]);
  });
});
