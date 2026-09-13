const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Local physical QA uses adb reverse to an isolated HTTP backend.
 * This plugin is included only by app.config.js for the qa2 flavor.
 * Production/release configurations never apply this manifest override.
 */
module.exports = function withQaLocalCleartext(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return mod;
  });
};
