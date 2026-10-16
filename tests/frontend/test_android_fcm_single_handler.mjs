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
  assert.match(plugin, /withMainApplication/);
  assert.match(plugin, /com\.google\.firebase\.messaging\.FirebaseMessagingService/);
  assert.match(plugin, /'tools:node': 'remove'/);
  assert.match(plugin, /add\(UrTruckNotificationBadgePackage\(\)\)/);
  assert.match(plugin, /add\(UrTruckSystemBarsPackage\(\)\)/);
});

test('QA build restores app-owned Kotlin classes after Expo prebuild clears android/', () => {
  const workflow = readFileSync('.github/workflows/build-android-apk.yml', 'utf8');
  const restore = readFileSync('scripts/restore_android_qa_native_sources.py', 'utf8');
  const verify = readFileSync('scripts/verify_android_fcm_apk.py', 'utf8');
  assert.match(workflow, /Restore app-owned Android Kotlin classes removed by prebuild/);
  assert.match(workflow, /verify_android_fcm_apk\.py/);
  assert.match(restore, /UrTruckFirebaseMessagingService\.kt/);
  assert.match(verify, /SERVICE_DESCRIPTOR/);
  assert.ok(verify.includes('re.fullmatch(r"classes(?:\\d+)?\\.dex", name)'));
});

test('Android dev-client restores the same exact-checkout Kotlin classes before compile', () => {
  const workflow = readFileSync('.github/workflows/build-android-dev-client.yml', 'utf8');
  const restore = workflow.indexOf('scripts/restore_android_qa_native_sources.py');
  const build = workflow.indexOf('./gradlew assembleDebug');
  assert.ok(restore >= 0 && build > restore);
  assert.match(workflow.slice(restore, build), /--expected-sha .*git rev-parse HEAD/);
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
  const mainApplication = {
    language: 'kt',
    contents: `package com.urtruck.app.qa2\n\nimport com.facebook.react.PackageList\n\nclass MainApplication {\n  val packages = PackageList(this).packages.apply {\n  }\n  override fun onCreate() {\n    super.onCreate()\n  }\n}`,
  };
  vm.runInNewContext(plugin, {
    module,
    require: () => ({
      withAndroidManifest: (config, callback) => callback(config),
      withMainApplication: (config, callback) => {
        callback({ modResults: mainApplication });
        return config;
      },
    }),
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
  assert.match(mainApplication.contents, /import com\.urtruck\.app\.UrTruckNotificationBadgePackage/);
  assert.match(mainApplication.contents, /import com\.urtruck\.app\.UrTruckSystemBarsPackage/);
  assert.match(mainApplication.contents, /add\(UrTruckNotificationBadgePackage\(\)\)/);
  assert.match(mainApplication.contents, /add\(UrTruckSystemBarsPackage\(\)\)/);
  assert.match(mainApplication.contents, /FirebaseMessaging\.getInstance\(\)\.setNotificationDelegationEnabled\(false\)/);
  assert.equal((mainApplication.contents.match(/setNotificationDelegationEnabled\(false\)/g) || []).length, 1);
});
