// The installed web app (PWA) carries the edition's name, colors and icons.
// public/ holds Prayer Tower's; for EXPO_PUBLIC_EDITION=open-circle this rewrites
// the exported dist/ after `expo export -p web`, before workbox-config.js caches
// it: manifest.json, the <meta> tags in index.html and icon-192/512.png
// (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest).
const fs = require('node:fs');
const path = require('node:path');

// Open Circle's color (scripts/branding/marks.mjs, app.config.js).
const TEAL = '#1D6F6A';

function openCircle(dist, name) {
  const manifestPath = path.join(dist, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest, {
    name,
    short_name: name,
    description: 'Ask for support and lift one another up. No ads.',
    theme_color: TEAL,
    background_color: TEAL,
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const htmlPath = path.join(dist, 'index.html');
  const safe = name.replace(/[<>"&]/g, '');
  const html = fs
    .readFileSync(htmlPath, 'utf8')
    .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*"/, (_m, start) => `${start}${safe}"`)
    .replace(/(<meta name="theme-color" content=")[^"]*"/, (_m, start) => `${start}${TEAL}"`);
  fs.writeFileSync(htmlPath, html);

  for (const size of [192, 512]) {
    fs.copyFileSync(path.join(__dirname, 'assets/images', `open-circle-icon-${size}.png`), path.join(dist, `icon-${size}.png`));
  }
}

/** Rewrites dist for the edition being built; Prayer Tower's build is left as it is. */
function apply(dist = path.join(__dirname, 'dist'), env = process.env) {
  if (env.EXPO_PUBLIC_EDITION === 'open-circle') openCircle(dist, env.EXPO_PUBLIC_OPEN_CIRCLE_NAME || 'Open Circle');
}

module.exports = { apply };
if (require.main === module) apply(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
