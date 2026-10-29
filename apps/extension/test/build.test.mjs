// Each edition gets its own name and icon; Open Circle's has no Prayer Tower wording.
import { mkdtempSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build } from '../scripts/build.mjs';

const copy = () => {
  const root = mkdtempSync(join(tmpdir(), 'ext-'));
  for (const p of ['manifest.json', 'src', 'icons']) cpSync(join(import.meta.dirname, '..', p), join(root, p), { recursive: true });
  return root;
};

describe('build', () => {
  it('makes the Open Circle edition with its own name, icon and wording', () => {
    const out = build('opencircle', copy());
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ name: 'Open Circle Cross-posting', short_name: 'Open Circle', action: { default_title: 'Open Circle Cross-posting' } });
    const page = readFileSync(join(out, 'src', 'options.html'), 'utf8');
    expect(page).toContain('your own Open Circle account');
    expect(`${page}${JSON.stringify(manifest)}`).not.toMatch(/Prayer Tower|pray/i);
    expect(existsSync(join(out, 'icons', 'icon-128.png'))).toBe(true);
  });

  it('makes the Prayer Tower edition and refuses unknown ones', () => {
    const root = copy();
    const manifest = JSON.parse(readFileSync(join(build('prayertower', root), 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe('Prayer Tower Cross-posting');
    expect(() => build('other', root)).toThrow(/Unknown edition/);
  });
});
