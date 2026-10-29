// The native app's words (apps/ios-native) come from this app's. Regenerate them with
//   npm run native-strings -w @prayer-tower/mobile
// (scripts/mac-build-native.sh does it before each Mac build). A stale copy is not an
// error here, so a wording change in this app never fails another pull request.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { nativeStringsJSON } from '@/lib/native-strings';

const DIR = join(__dirname, '../../../ios-native/Sources/PrayerTowerKit/Resources');
const FILES = { faith: 'strings-faith.json', neutral: 'strings-neutral.json' } as const;

describe('native app strings', () => {
  const json = nativeStringsJSON();
  if (process.env.WRITE_NATIVE_STRINGS) for (const k of ['faith', 'neutral'] as const) writeFileSync(join(DIR, FILES[k]), json[k]);

  it.each(['faith', 'neutral'] as const)('%s words are committed for the native app', (k) => {
    const committed = JSON.parse(readFileSync(join(DIR, FILES[k]), 'utf8')) as Record<string, string>;
    expect(typeof committed['compose.post']).toBe('string');
  });

  it('gives Open Circle no prayer words where Prayer Tower has them', () => {
    const n = JSON.parse(json.neutral) as Record<string, string>;
    expect(n['compose.placeholder']).toBe("What's on your mind?");
    expect(n['literal:Prayer Request']).toBe('Request');
    expect(n['backupCodes.title']).toBe('Backup codes');
  });
});
