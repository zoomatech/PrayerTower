// Builds with APP_VARIANT=staging (the EAS "staging" profile) get their own
// name and bundle ID, so a staging build installs next to the store app and
// talks to the staging API. Everything else comes from app.json.
// See https://docs.expo.dev/tutorial/eas/multiple-app-variants/
const STAGING = process.env.APP_VARIANT === 'staging';

module.exports = ({ config }) => {
  if (!STAGING) return config;
  const id = `${config.ios.bundleIdentifier}.staging`;
  return {
    ...config,
    name: `${config.name} (Staging)`,
    ios: { ...config.ios, bundleIdentifier: id },
    android: { ...config.android, package: id },
  };
};
