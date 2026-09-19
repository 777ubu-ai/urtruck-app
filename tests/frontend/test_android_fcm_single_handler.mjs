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
