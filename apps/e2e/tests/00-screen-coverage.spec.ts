// Every screen in the app is visited by a walk: the member walks (18-open-circle,
// 22-pilot-walk) or the staff walk (19-staff-a11y). A new screen fails here until
// it is added to one, so crashes, axe violations and Open Circle wording are checked on it.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '../../mobile/src/app');
// Screens that need an ID; the walks open them through real records where they can.
const NEEDS_ID = ['appeal/[id]', 'conversation/[id]', 'event/[id]', 'mend/[id]', 'people/[id]', 'post/[id]', 'survey/[id]'];

function screens(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return screens(path);
    if (!e.name.endsWith('.tsx') || e.name === '_layout.tsx' || e.name.startsWith('+')) return [];
    return [relative(APP, path).replace(/\.tsx$/, '').replace(/\(tabs\)\//, '').replace(/(^|\/)index$/, '')];
  });
}

test('every screen is in a walk', () => {
  const walked = ['18-open-circle.spec.ts', '22-pilot-walk.spec.ts', '19-staff-a11y.spec.ts']
    .map((f) => readFileSync(join(HERE, f), 'utf8'))
    .join('\n');
  const missing = screens(APP).filter((s) => s && !NEEDS_ID.includes(s) && !walked.includes(`'/${s}'`));
  expect(missing).toEqual([]);
});
