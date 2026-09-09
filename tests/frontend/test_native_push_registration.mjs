import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/utils/push.js', import.meta.url), 'utf8');

test('native registration obtains and registers the platform FCM/APNs token', () => {
  assert.match(source, /Notifications\.getDevicePushTokenAsync\(\)/);
  assert.match(source, /provider: Platform\.OS === 'android' \? 'fcm' : 'apns'/);
  assert.match(source, /registrations\.push\(await registerToken\([\s\S]*nativeTokenData\.data/);
});

test('native registration retains Expo fallback and current ownership/linking guards', () => {
  assert.match(source, /provider: 'expo'/);
  assert.match(source, /reason: 'token_conflict'/);
  assert.match(source, /reason: 'not_linked'/);
  assert.match(source, /await storage\.set\(NATIVE_TOKEN_KEY/);
  assert.match(source, /async logoutCleanup\(token = null\)/);
});
