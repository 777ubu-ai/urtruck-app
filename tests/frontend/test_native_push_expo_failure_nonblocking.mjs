import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/utils/push.js', import.meta.url), 'utf8');
const expoStart = source.indexOf('let tokenData;');
const expoRegistration = source.slice(
  expoStart,
  source.indexOf('const authToken = await storage.get(TOKEN_KEY);', expoStart),
);

test('Expo token failure does not return before native FCM/APNs registration', () => {
  assert.match(expoRegistration, /expoTokenError = String\(e\)/);
  assert.doesNotMatch(expoRegistration, /catch \(e\) \{[\s\S]*?return \{ ok: false/);
  assert.match(source, /getDevicePushTokenAsync\(\)/);
  assert.match(source, /if \(nativeResult\?\.ok\) \{/);
});
