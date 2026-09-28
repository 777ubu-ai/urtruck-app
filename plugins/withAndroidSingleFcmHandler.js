const { withAndroidManifest } = require('@expo/config-plugins');

const FIREBASE_BASE_SERVICE = 'com.google.firebase.messaging.FirebaseMessagingService';

/**
 * expo-notifications supplies ExpoFirebaseMessagingService, which is the
 * canonical UrTruck handler.  Remove firebase-messaging's concrete base
 * service from the merged manifest so one FCM message cannot be presented by
 * two services on Android/Xiaomi.
 */
module.exports = function withAndroidSingleFcmHandler(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    const application = manifest.application?.[0];
    if (!application) return mod;

    application.service = application.service || [];
    const existing = application.service.find(
      (service) => service.$?.['android:name'] === FIREBASE_BASE_SERVICE,
    );
    const attributes = {
      'android:name': FIREBASE_BASE_SERVICE,
      'tools:node': 'remove',
    };
    if (existing) existing.$ = { ...(existing.$ || {}), ...attributes };
    else application.service.push({ $: attributes });
    return mod;
  });
};
