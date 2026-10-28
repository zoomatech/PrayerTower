// Shared request and comment links (https://<site>/post/...) open the app when
// it is installed: iOS universal links (Associated Domains) and Android App
// Links (a verified intent filter). The domain comes from EXPO_PUBLIC_LINK_URL,
// so staging and production builds each verify their own site; unset = no
// links, the share text then uses the prayertower:// scheme.
// The site serves the matching /.well-known files (docs/APP_LINKS.md).
// https://docs.expo.dev/linking/ios-universal-links/
// https://docs.expo.dev/linking/android-app-links/
module.exports = function withAppLinks(config) {
  const url = process.env.EXPO_PUBLIC_LINK_URL;
  if (!url) return config;
  const { protocol, host } = new URL(url);
  if (protocol !== 'https:') throw new Error('EXPO_PUBLIC_LINK_URL must be an https address for app links.');
  config.ios = { ...config.ios, associatedDomains: [...new Set([...(config.ios?.associatedDomains ?? []), `applinks:${host}`])] };
  config.android = {
    ...config.android,
    intentFilters: [
      ...(config.android?.intentFilters ?? []),
      { action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host, pathPrefix: '/post/' }], category: ['BROWSABLE', 'DEFAULT'] },
    ],
  };
  return config;
};
