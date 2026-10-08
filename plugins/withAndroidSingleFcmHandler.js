const { withAndroidManifest } = require('@expo/config-plugins');

const FIREBASE_BASE_SERVICE = 'com.google.firebase.messaging.FirebaseMessagingService';
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const URTRUCK_SERVICE = 'com.urtruck.app.UrTruckFirebaseMessagingService';

// One handler, inheriting Expo's token/render/deeplink delegate. The wrapper
// updates the native unread badge even when FCM renders notification+data in
// background without calling onMessageReceived.
module.exports = function withAndroidSingleFcmHandler(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const application = manifest.application?.[0];
    if (!application) return mod;
    application['meta-data'] = application['meta-data'] || [];
    application['meta-data'] = application['meta-data'].filter(
      (m) => m.$?.['android:name'] !== 'firebase_messaging_notification_delegation_enabled',
    );
    application['meta-data'].push({ $: {
      'android:name': 'firebase_messaging_notification_delegation_enabled',
      'android:value': 'false', 'tools:replace': 'android:value',
    } });
    application.service = application.service || [];
    for (const name of [FIREBASE_BASE_SERVICE, EXPO_SERVICE]) {
      const existing = application.service.find((s) => s.$?.['android:name'] === name);
      const attributes = { 'android:name': name, 'tools:node': 'remove' };
      if (existing) existing.$ = { ...(existing.$ || {}), ...attributes };
      else application.service.push({ $: attributes });
    }
    application.service = application.service.filter(
      (s) => !['.UrTruckFirebaseMessagingService', URTRUCK_SERVICE].includes(s.$?.['android:name']),
    );
    application.service.push({
      $: { 'android:name': URTRUCK_SERVICE, 'android:exported': 'false' },
      'intent-filter': [{
        $: { 'android:priority': '-1' },
        action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
      }],
    });
    return mod;
  });
};
