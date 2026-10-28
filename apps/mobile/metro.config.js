// Metro config: Expo's defaults plus Sentry's, with Sentry's web-only Session
// Replay and Feedback packages left out of the bundle (we use neither; about
// 0.5 MB of source). See https://docs.sentry.io/platforms/react-native/guides/expo/manual-setup/metro/
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
  includeWebFeedback: false,
});
