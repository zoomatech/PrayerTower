/// <reference types="node" />
// Every screen must sit behind a sign-in guard in app/_layout.tsx. A screen left
// out is open to everyone, and Expo Router sends signed-out visitors to it
// (a new visitor once landed on "My church" instead of sign-in).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const appDir = join(__dirname, '..', 'app');

function screens(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('(') ? [] : screens(path);
    if (!e.name.endsWith('.tsx') || e.name.startsWith('_') || e.name.startsWith('+')) return [];
    return [relative(appDir, path).replace(/\.tsx$/, '')];
  });
}

it('lists every screen in a guarded group', () => {
  const layout = readFileSync(join(appDir, '_layout.tsx'), 'utf8');
  const listed = new Set([...layout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((m) => m[1]));
  expect(screens(appDir).filter((s) => !listed.has(s))).toEqual([]);
});
