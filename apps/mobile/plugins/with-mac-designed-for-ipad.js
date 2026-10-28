// Lists "Mac (Designed for iPad)" in the Xcode target's Supported Destinations, so
// the iPhone/iPad app also builds and runs on Apple silicon Macs. Expo regenerates
// the Xcode project on prebuild, so the setting lives here rather than in ios/.
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withMacDesignedForIPad(config) {
  return withXcodeProject(config, (cfg) => {
    const configurations = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const { buildSettings } of Object.values(configurations)) {
      if (buildSettings?.PRODUCT_NAME !== undefined) {
        buildSettings.SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = 'YES';
      }
    }
    return cfg;
  });
};
