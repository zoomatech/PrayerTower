// Every notification the server sends with a translation key has Spanish text,
// and each template reads well with and without its optional details.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localize } from '../src/modules/notifications/i18n.js';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

// `t: { key: 'x' }`, or a choice such as `key: a === 'b' ? 'x' : 'y'` (the keys follow `?` or `:`).
const keys = [
  ...new Set(
    sources(new URL('../src', import.meta.url).pathname).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/\bt: \{ key: ([^,}]+)/g)].flatMap((m) => [...m[1]!.matchAll(/(?:^|[?:]\s*)'([a-z_]+)'/g)].map((k) => k[1]!)),
    ),
  ),
].sort();

const full = {
  who: 'Ana',
  poster: 'Luis',
  body: 'Por la salud de mi madre',
  title: 'Noche de oración',
  name: 'Iglesia Central',
  church: 'Iglesia Central',
  note: 'Llamamos a la oficina',
  count: 3,
  tasks: 'notifications_send_push',
  rule: 'abuse',
  noun: 'comment',
  decision: 'upheld',
  frequency: 'daily',
  minutes: 15,
  amount: 2,
  milestone: 'first_prayer',
};

describe('notification translations', () => {
  it('finds the keys the server sends', () => {
    expect(keys.length).toBeGreaterThan(20);
  });

  it.each(keys)('has Spanish text for %s', (key) => {
    for (const params of [full, {}]) {
      const es = localize('es', key, params);
      expect(es, key).not.toBeNull();
      expect(es!.title.trim(), key).not.toBe('');
      expect(`${es!.title} ${es!.body}`, key).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  it('keeps the English text for English readers and unknown keys', () => {
    expect(localize('en', 'praying_now', full)).toBeNull();
    expect(localize(null, 'praying_now', full)).toBeNull();
    expect(localize('es', 'no_such_key', full)).toBeNull();
  });

  it('fills in the details it is given', () => {
    expect(localize('es', 'praying_now', { who: 'Ana' })!.title).toContain('Ana');
    expect(localize('es', 'praying_now', {})!.title).toContain('Alguien');
    expect(localize('es', 'job_alert', { count: 1, tasks: 'radio_transmit' })).not.toBeNull();
  });
});
