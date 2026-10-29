// The Open Circle web build installs under its own name, color and icon (web-edition.js).
/* eslint-disable @typescript-eslint/no-require-imports */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { apply } = require('../../web-edition');
const PUBLIC = path.join(__dirname, '../../public');

function build() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'web-edition-'));
  for (const f of ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']) fs.copyFileSync(path.join(PUBLIC, f), path.join(dist, f));
  return dist;
}

it('gives the Open Circle build its name, color and icons', () => {
  const dist = build();
  apply(dist, { EXPO_PUBLIC_EDITION: 'open-circle', EXPO_PUBLIC_OPEN_CIRCLE_NAME: 'Kind Circle' });
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
  expect(manifest).toMatchObject({ name: 'Kind Circle', short_name: 'Kind Circle', theme_color: '#1D6F6A' });
  expect(manifest.description).not.toMatch(/pray/i);
  const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Kind Circle"');
  expect(html).not.toContain('Prayer Tower');
  expect(fs.readFileSync(path.join(dist, 'icon-512.png'))).toEqual(fs.readFileSync(path.join(__dirname, '../../assets/images/open-circle-icon-512.png')));
});

it('leaves the Prayer Tower build as it is', () => {
  const dist = build();
  apply(dist, {});
  expect(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8')).toBe(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
});
