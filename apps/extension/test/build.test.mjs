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

  it('adds Safari\'s minimum version only to the Safari build', () => {
    const root = copy();
    const chrome = JSON.parse(readFileSync(join(build('prayertower', root), 'manifest.json'), 'utf8'));
    expect(chrome.browser_specific_settings).toBeUndefined();
    const safari = JSON.parse(readFileSync(join(build('opencircle', root, { safari: true }), 'manifest.json'), 'utf8'));
    expect(safari.browser_specific_settings).toEqual({ safari: { strict_min_version: '16.4' } });
    expect(safari.options_ui.open_in_tab).toBeUndefined();
    expect(chrome.options_ui.open_in_tab).toBe(true);
    // Apple: in iOS the background must be nonpersistent; a Manifest V3 service worker is.
    expect(safari.background).toEqual({ service_worker: 'src/background.js' });
  });

  it('has a settings page that follows dark mode and the device text size', () => {
    const page = readFileSync(join(import.meta.dirname, '..', 'src', 'options.html'), 'utf8');
    expect(page).toContain('color-scheme: light dark');
    expect(page).toContain('prefers-color-scheme: dark');
    expect(page).toContain('-apple-system-body');
  });
});
