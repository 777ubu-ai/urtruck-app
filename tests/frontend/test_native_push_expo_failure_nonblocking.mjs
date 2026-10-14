import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/utils/push.js', import.meta.url), 'utf8');
test('native client has no Expo Push Service registration', () => {
  assert.doesNotMatch(source, /getExpoPushTokenAsync/);
  assert.doesNotMatch(source, /ExponentPushToken/);
  assert.doesNotMatch(source, /exp\.host\/--\/api/);
  assert.match(source, /getDevicePushTokenAsync\(\)/);
  assert.match(source, /register-native/);
});
