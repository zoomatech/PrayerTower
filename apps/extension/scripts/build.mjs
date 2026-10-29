// Build the extension for one edition into apps/extension/dist/<edition>/:
//   node scripts/build.mjs prayertower   (default)
//   node scripts/build.mjs opencircle    (Open Circle: its own name and icon, no religious wording)
// The folder is what goes to the Chrome Web Store (zip it) and to Apple's Safari packager
// (scripts/safari.sh). See docs/CROSSPOST.md.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EDITIONS = {
  prayertower: { name: 'Prayer Tower Cross-posting', short: 'Prayer Tower', account: 'Prayer Tower', icon: 'icon' },
  opencircle: { name: 'Open Circle Cross-posting', short: 'Open Circle', account: 'Open Circle', icon: 'open-circle' },
};

export function build(edition, root = join(dirname(fileURLToPath(import.meta.url)), '..')) {
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
  console.log(build(process.argv[2] ?? 'prayertower'));
}
