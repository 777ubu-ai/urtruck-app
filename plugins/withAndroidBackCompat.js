/**
 * Expo Config Plugin: Android 16 (API 36) predictive back compatibility.
 *
 * Android 16 при targetSdk 36 по умолчанию включает predictive back и
 * перестаёт вызывать legacy onBackPressed() / KEYCODE_BACK. React Native
 * 0.76 (Expo SDK 52) ещё не поддерживает новый back API — поддержка
 * появилась в RN 0.81 (Expo SDK 54).
 *
 * Этот plugin ставит android:enableOnBackInvokedCallback="false" на
 * <application>, что является официальным временным compatibility path:
 * https://developer.android.com/about/versions/16/behavior-changes-16
 *
 * После миграции на Expo SDK 54+ / RN 0.81+ этот plugin убрать.
 */
const { withAndroidManifest } = require('expo/config-plugins');

function withAndroidBackCompat(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const application = manifest?.manifest?.application?.[0];
    if (application) {
      application.$['android:enableOnBackInvokedCallback'] = 'false';
    }
    return config;
  });
}

module.exports = withAndroidBackCompat;
