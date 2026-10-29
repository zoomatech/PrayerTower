// The app's privacy manifest (ios.privacyManifests in app.json) must list every
// "required reason" API that the app's iOS packages declare in their own
// PrivacyInfo.xcprivacy. Apple doesn't reliably read the packages' own files,
// so the app's manifest carries them (https://docs.expo.dev/guides/apple-privacy/).
// When an update adds a package or a reason, this test names what to add.
import fs from 'node:fs';
/* eslint-disable @typescript-eslint/no-require-imports */
import path from 'node:path';

import plist from '@expo/plist';

const root = path.resolve(__dirname, '../../../..');
const app = require('../../app.json').expo;

type Access = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };

function packageManifests(): string[] {
  const found: string[] = [];
  for (const dir of [path.join(root, 'node_modules'), path.join(root, 'apps/mobile/node_modules')]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const pkgs = name.startsWith('@') ? fs.readdirSync(path.join(dir, name)).map((n) => path.join(name, n)) : [name];
      for (const pkg of pkgs) {
        const file = path.join(dir, pkg, 'ios', 'PrivacyInfo.xcprivacy');
        if (fs.existsSync(file)) found.push(file);
      }
    }
  }
  return found;
}

describe('privacy manifest', () => {
  it('says the app does no tracking and has no encryption beyond the system’s own', () => {
    expect(app.ios.privacyManifests.NSPrivacyTracking).toBe(false);
    expect(app.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('lists every reason the iOS packages declare', () => {
    const ours = new Map<string, Set<string>>(
      (app.ios.privacyManifests.NSPrivacyAccessedAPITypes as Access[]).map((a) => [a.NSPrivacyAccessedAPIType, new Set(a.NSPrivacyAccessedAPITypeReasons)]),
    );
    const files = packageManifests();
    expect(files.length).toBeGreaterThan(0);
    const missing: string[] = [];
    for (const file of files) {
      const parsed = plist.parse(fs.readFileSync(file, 'utf8')) as { NSPrivacyAccessedAPITypes?: Access[] };
      for (const a of parsed.NSPrivacyAccessedAPITypes ?? []) {
        for (const r of a.NSPrivacyAccessedAPITypeReasons) {
          if (!ours.get(a.NSPrivacyAccessedAPIType)?.has(r)) missing.push(`${a.NSPrivacyAccessedAPIType} ${r} (${path.relative(root, file)})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
