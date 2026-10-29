// Builds with APP_VARIANT=staging (the EAS "staging" profile) get their own
// name and bundle ID, so a staging build installs next to the store app and
// talks to the staging API. Everything else comes from app.json.
// See https://docs.expo.dev/tutorial/eas/multiple-app-variants/
//
// Over-the-air updates (EAS Update, docs/RELEASING_APPS.md) need the EAS project
// ID: from `eas init` (extra.eas.projectId in app.json) or EAS_PROJECT_ID. Until
// then the app is built without an update URL, so it never checks for updates.
// https://docs.expo.dev/eas-update/getting-started/
//
// Android push (Firebase Cloud Messaging) stays off until Firebase's
// google-services.json exists: either the file in this folder, or an EAS file
// environment variable GOOGLE_SERVICES_JSON (its path on the build server).
// docs/archive/ANDROID_PUSH.md; https://docs.expo.dev/push-notifications/fcm-credentials/
//
// EXPO_PUBLIC_EDITION=open-circle builds the separately branded, non-religious
// app (Steve, 2026-10-28): its own name, bundle ID and link scheme, always the
// neutral wording, and new members join the Open Circle community. Its icon,
// splash and favicon are assets/images/open-circle-*.png (npm run brand --
// --edition open-circle). "Open Circle" is a placeholder name until Steve picks
// one: EXPO_PUBLIC_OPEN_CIRCLE_NAME sets it for the build.
const fs = require('node:fs');
const path = require('node:path');

const STAGING = process.env.APP_VARIANT === 'staging';
const OPEN_CIRCLE = process.env.EXPO_PUBLIC_EDITION === 'open-circle';
// Open Circle's color (scripts/branding/marks.mjs).
const TEAL = '#1D6F6A';

/** The Open Circle app's name, IDs, icon and wording over the Prayer Tower ones. */
function openCircle(config) {
  const id = 'com.zoomatech.opencircle';
  const name = process.env.EXPO_PUBLIC_OPEN_CIRCLE_NAME || 'Open Circle';
  const image = (file, fallback) => (fs.existsSync(path.join(__dirname, 'assets/images', file)) ? `./assets/images/${file}` : fallback);
  const icon = image('open-circle-icon.png', config.icon);
  // Plugin settings that carry Prayer Tower's colors or words.
  const plugins = config.plugins.map((p) => {
    if (!Array.isArray(p)) return p;
    const [plugin, opts] = p;
    if (plugin === 'expo-splash-screen') return [plugin, { ...opts, backgroundColor: TEAL, image: image('open-circle-splash-icon.png', opts.image) }];
    if (plugin === 'expo-notifications') return [plugin, { ...opts, color: TEAL }];
    if (plugin === 'expo-image-picker') return [plugin, { ...opts, photosPermission: `Allow ${name} to add your photos and videos to your posts.` }];
    if (plugin === 'expo-audio') return [plugin, { ...opts, microphonePermission: 'Allow $(PRODUCT_NAME) to record the voice notes you choose to send, and to hear radio bursts when you tap Start listening.' }];
    if (plugin === 'expo-widgets' || plugin === 'react-native-android-widget') {
      const widgets = opts.widgets.map((w) => ({ ...w, displayName: w.displayName && 'Lift Someone Up', label: w.label && 'Lift someone up', description: 'The next request that could use your support.' }));
      return [plugin, { ...opts, widgets: widgets.map((w) => Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined))) }];
    }
    return p;
  });
  return {
    ...config,
    name,
    slug: 'open-circle',
    scheme: 'opencircle',
    icon,
    plugins,
    ios: { ...config.ios, bundleIdentifier: id, icon },
    android: { ...config.android, package: id, adaptiveIcon: { ...config.android.adaptiveIcon, backgroundColor: TEAL } },
    web: { ...config.web, favicon: image('open-circle-favicon.png', config.web.favicon) },
  };
}

/** The google-services.json to build with, or null while Android push is off. */
function googleServicesFile() {
  if (process.env.GOOGLE_SERVICES_JSON) return process.env.GOOGLE_SERVICES_JSON;
  return fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : null;
}

/** The EAS project ID, or null before `eas init`. */
function easProjectId(config) {
  return config.extra?.eas?.projectId ?? process.env.EAS_PROJECT_ID ?? null;
}

module.exports = ({ config }) => {
  if (OPEN_CIRCLE) config = openCircle(config);
  const firebase = googleServicesFile();
  const android = firebase ? { ...config.android, googleServicesFile: firebase } : config.android;
  const projectId = easProjectId(config);
  if (projectId) {
    config = {
      ...config,
      extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } },
      updates: { ...config.updates, url: `https://u.expo.dev/${projectId}` },
    };
  }
  if (!STAGING) return { ...config, android };
  const id = `${config.ios.bundleIdentifier}.staging`;
  return {
    ...config,
    name: `${config.name} (Staging)`,
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...android, package: id },
  };
};
