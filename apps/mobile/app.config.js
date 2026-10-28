// Builds with APP_VARIANT=staging (the EAS "staging" profile) get their own
// name and bundle ID, so a staging build installs next to the store app and
// talks to the staging API. Everything else comes from app.json.
// See https://docs.expo.dev/tutorial/eas/multiple-app-variants/
//
// Android push (Firebase Cloud Messaging) stays off until Firebase's
// google-services.json exists: either the file in this folder, or an EAS file
// environment variable GOOGLE_SERVICES_JSON (its path on the build server).
// docs/archive/ANDROID_PUSH.md; https://docs.expo.dev/push-notifications/fcm-credentials/
const fs = require('node:fs');
const path = require('node:path');

const STAGING = process.env.APP_VARIANT === 'staging';

/** The google-services.json to build with, or null while Android push is off. */
function googleServicesFile() {
  if (process.env.GOOGLE_SERVICES_JSON) return process.env.GOOGLE_SERVICES_JSON;
  return fs.existsSync(path.join(__dirname, 'google-services.json')) ? './google-services.json' : null;
}

module.exports = ({ config }) => {
  const firebase = googleServicesFile();
  const android = firebase ? { ...config.android, googleServicesFile: firebase } : config.android;
  if (!STAGING) return { ...config, android };
  const id = `${config.ios.bundleIdentifier}.staging`;
  return {
    ...config,
    name: `${config.name} (Staging)`,
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...android, package: id },
  };
};
