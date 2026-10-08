import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const appConfig = JSON.parse(readFileSync('app.json', 'utf8'));
const plugin = readFileSync('plugins/withAndroidSingleFcmHandler.js', 'utf8');

test('Android removes the duplicate Firebase base messaging service', () => {
  assert.match(
    manifest,
    /<service\s+android:name="com\.google\.firebase\.messaging\.FirebaseMessagingService"\s+tools:node="remove"\s*\/>/,
  );
  assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
});

test('Expo prebuild always reapplies the single FCM handler contract', () => {
  assert.ok(appConfig.expo.plugins.includes('./plugins/withAndroidSingleFcmHandler'));
  assert.match(plugin, /withAndroidManifest/);
  assert.match(plugin, /com\.google\.firebase\.messaging\.FirebaseMessagingService/);
  assert.match(plugin, /'tools:node': 'remove'/);
});

test('one non-exported UrTruck handler inherits Expo instead of duplicating presentation', () => {
  const service = readFileSync('android/app/src/main/java/com/urtruck/app/UrTruckFirebaseMessagingService.kt', 'utf8');
  assert.match(manifest, /android:name="expo.modules.notifications.service.ExpoFirebaseMessagingService" tools:node="remove"/);
  assert.match(manifest, /android:name=".UrTruckFirebaseMessagingService" android:exported="false"/);
  assert.match(service, /: ExpoFirebaseMessagingService\(\)/);
  assert.match(service, /super\.handleIntent\(intent\)/);
  assert.doesNotMatch(service, /NotificationManager|\.notify\(/);
  assert.match(manifest, /firebase_messaging_notification_delegation_enabled" android:value="false"/);
});

test('zero badge native path never cancels OS notifications', () => {
  const store = readFileSync('android/app/src/main/java/com/urtruck/app/UrTruckNotificationBadgeStore.kt', 'utf8');
  const app = readFileSync('android/app/src/main/java/com/urtruck/app/MainApplication.kt', 'utf8');
  assert.match(store, /ShortcutBadger\.applyCountOrThrow\(context\.applicationContext, count\)/);
  assert.doesNotMatch(store, /notificationManager\.|\.cancelAll\(/);
  assert.match(app, /add\(UrTruckNotificationBadgePackage\(\)\)/);
});

test('prebuild callback is idempotent and replaces both competing SDK handlers', async () => {
  const vm = await import('node:vm');
  const module = { exports: null };
  vm.runInNewContext(plugin, {
    module,
    require: () => ({ withAndroidManifest: (config, callback) => callback(config) }),
  });
  const config = { modResults: { manifest: { application: [{
    service: [
      { $: { 'android:name': 'com.google.firebase.messaging.FirebaseMessagingService' } },
      { $: { 'android:name': 'expo.modules.notifications.service.ExpoFirebaseMessagingService' } },
      { $: { 'android:name': '.UrTruckFirebaseMessagingService' } },
    ],
  }] } } };
  module.exports(config);
  module.exports(config);
  const application = config.modResults.manifest.application[0];
  const live = application.service.filter((s) => s.$['tools:node'] !== 'remove');
  assert.equal(live.length, 1);
  assert.equal(live[0].$['android:exported'], 'false');
  assert.equal(live[0].$['android:name'], 'com.urtruck.app.UrTruckFirebaseMessagingService');
  assert.equal(application.service.filter((s) => s.$['tools:node'] === 'remove').length, 2);
  assert.equal(application['meta-data'].length, 1);
});
