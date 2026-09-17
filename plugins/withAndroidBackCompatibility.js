const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Keep Android's legacy back dispatch available for the React Native
 * BackHandler used by the root React Navigation stack.  RN 0.76/native-stack
 * does not yet consume Android's predictive-back dispatcher consistently on
 * API 35/36; without this flag a hardware Back can finish the Activity
 * instead of popping the in-app route.
 */
module.exports = function withAndroidBackCompatibility(config) {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    const activity = application?.activity?.find((item) =>
      item.$?.['android:name'] === '.MainActivity'
    );
    if (activity) {
      activity.$['android:enableOnBackInvokedCallback'] = 'false';
    }
    return mod;
  });
};
