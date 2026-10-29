// Build the extension for one edition into apps/extension/dist/<edition>/:
//   node scripts/build.mjs prayertower   (default)
//   node scripts/build.mjs opencircle    (Open Circle: its own name and icon, no religious wording)
//   node scripts/build.mjs opencircle --safari   (adds Safari's minimum version; scripts/safari.sh uses this)
// The folder is what goes to the Chrome Web Store (zip it) and to Apple's Safari packager
// (scripts/safari.sh). See docs/CROSSPOST.md.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITIONS = {
  prayertower: { name: 'Prayer Tower Cross-posting', short: 'Prayer Tower', account: 'Prayer Tower', icon: 'icon' },
  opencircle: { name: 'Open Circle Cross-posting', short: 'Open Circle', account: 'Open Circle', icon: 'open-circle' },
};

// Safari 16.4 is the first with everything the extension uses: Manifest V3 service workers,
// unlimited storage and OffscreenCanvas (for shrinking large photos).
const SAFARI_MIN = '16.4';

export function build(edition, root = join(dirname(fileURLToPath(import.meta.url)), '..'), { safari = false } = {}) {
  const e = EDITIONS[edition];
  if (!e) throw new Error(`Unknown edition "${edition}" (use ${Object.keys(EDITIONS).join(' or ')})`);
  const out = join(root, 'dist', edition);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'icons'), { recursive: true });
  cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });
  for (const size of [16, 32, 48, 128]) cpSync(join(root, 'icons', `${e.icon}-${size}.png`), join(out, 'icons', `icon-${size}.png`));

  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  manifest.name = e.name;
  manifest.short_name = e.short;
  manifest.action.default_title = e.name;
  manifest.description = `When you post on Facebook or Threads, the same post (words, photos and videos) goes to your own ${e.account} account.`;
  // Only the Safari build says which Safari it needs; Chrome would warn about the unknown key.
  if (safari) manifest.browser_specific_settings = { safari: { strict_min_version: SAFARI_MIN } };
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const page = join(out, 'src', 'options.html');
  writeFileSync(
    page,
    readFileSync(page, 'utf8')
      .replaceAll('Prayer Tower Cross-posting', e.name)
      .replace('your own Prayer Tower (or Open Circle) account', `your own ${e.account} account`),
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  console.log(build(args.find((a) => !a.startsWith('--')) ?? 'prayertower', undefined, { safari: args.includes('--safari') }));
}
