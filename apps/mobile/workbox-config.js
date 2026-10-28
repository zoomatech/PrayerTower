// Service worker for the web build (PWA), generated after `expo export -p web`
// by `node workbox-config.js` (workbox-build's generateSW, which the
// workbox-cli in https://docs.expo.dev/guides/progressive-web-apps/ wraps). It precaches the app
// shell (hashed JS, fonts, icons, index.html). API calls go to another origin
// and are never cached here; the app's own offline queue and saved feed
// (src/lib/offline.ts) work on the web as they do on phones.
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{js,html,ttf,ico,json,png,css}'],
  // Expo's web bundle is a few MB; the default 2 MB limit would leave it out.
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
  swDest: 'dist/sw.js',
  // Every route is the same single page (web.output "single").
  navigateFallback: '/index.html',
  // A new build takes over on the next load instead of waiting for every tab to close.
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  ignoreURLParametersMatching: [/^utm_/, /^fbclid$/],
};

if (require.main === module) {
  require('workbox-build')
    .generateSW(module.exports)
    .then(({ count, size, warnings }) => {
      for (const w of warnings) console.warn(w);
      console.log(`Service worker: ${count} files precached, ${(size / 1024 / 1024).toFixed(1)} MB.`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
