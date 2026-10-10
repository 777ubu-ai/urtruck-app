import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveOneSignalPilot } = require('../../config/onesignal-pilot.js');
const valid = { URTRUCK_PUSH_PROVIDER: 'onesignal', URTRUCK_BUILD_FLAVOR: 'qa2',
  EXPO_PUBLIC_API_URL: 'https://qa2.urtruck.kz', URTRUCK_ONESIGNAL_PLATFORMS_READY: '1' };
test('production defaults keep the direct provider', () => {
  assert.deepEqual(resolveOneSignalPilot({}), { enabled: false });
});
test('OneSignal cannot be enabled for production', () => {
  assert.throws(() => resolveOneSignalPilot({ ...valid, URTRUCK_BUILD_FLAVOR: 'production' }));
});
test('pilot rejects production, arbitrary host and cleartext API', () => {
  for (const url of ['https://urtruck.kz', 'https://example.com', 'http://qa2.urtruck.kz', '']) {
    assert.throws(() => resolveOneSignalPilot({ ...valid, EXPO_PUBLIC_API_URL: url }));
  }
});
test('unverified gateway configuration blocks a native build', () => {
  assert.throws(() => resolveOneSignalPilot({ ...valid, URTRUCK_ONESIGNAL_PLATFORMS_READY: '' }));
});
test('verified pilot uses a separate application identity', () => {
  assert.equal(resolveOneSignalPilot(valid).bundleIdentifier, 'com.urtruck.app.qa2');
  assert.equal(resolveOneSignalPilot({ ...valid, EXPO_PUBLIC_API_URL: valid.EXPO_PUBLIC_API_URL + '/' }).enabled, true);
});
