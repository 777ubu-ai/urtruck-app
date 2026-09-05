import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const debugManifest = fs.readFileSync('android/app/src/debug/AndroidManifest.xml', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');

test('release manifest disables global cleartext traffic while debug keeps local HTTP override', () => {
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /android:usesCleartextTraffic="true"/);
  assert.match(debugManifest, /android:usesCleartextTraffic="true"/);
});

test('release signing fails closed instead of falling back to debug keystore', () => {
  assert.match(gradle, /Release signing is not configured/);
  assert.match(gradle, /signingConfig signingConfigs\.release/);
  assert.doesNotMatch(gradle, /signingConfig project\.hasProperty\('URTRUCK_UPLOAD_STORE_FILE'\) \? signingConfigs\.release : signingConfigs\.debug/);
});

test('release manifest does not ship overlay permission', () => {
  assert.doesNotMatch(manifest, /android\.permission\.SYSTEM_ALERT_WINDOW/);
  assert.match(debugManifest, /android\.permission\.SYSTEM_ALERT_WINDOW/);
});

test('release version code fails closed without CI assignment', () => {
  assert.match(gradle, /Release versionCode is not configured/);
  assert.match(gradle, /-PURTRUCK_VERSION_CODE/);
  assert.match(gradle, /configuredVersionCode \? configuredVersionCode\.toInteger\(\) : 9/);
});

test('Firebase plugin is applied before Android configuration', () => {
  const pluginIndex = gradle.indexOf('com.google.gms.google-services');
  const androidIndex = gradle.indexOf('android {');
  assert.ok(pluginIndex >= 0 && pluginIndex < androidIndex);
});
