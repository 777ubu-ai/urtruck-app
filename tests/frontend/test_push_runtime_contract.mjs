import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const appJson = JSON.parse(read('app.json'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
const push = read('src/utils/push.js');
const badge = read('src/utils/appBadge.js');
const entitlements = read('ios/UrTruck/UrTruck.entitlements');

test('Android 13 notification permission and native channel are explicit', () => {
  assert.ok(appJson.expo.android.permissions.includes('android.permission.POST_NOTIFICATIONS'));
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(push, /setNotificationChannelAsync\(NATIVE_PUSH_CHANNEL_ID/);
  assert.match(push, /AndroidImportance\.MAX/);
  assert.match(push, /async nativePermission\(\)/);
  assert.match(push, /openNativeNotificationSettings/);
});

test('iOS has APNs entitlement and foreground presentation handler', () => {
  assert.match(entitlements, /<key>aps-environment<\/key>/);
  assert.match(push, /Notifications\.setNotificationHandler/);
  assert.match(push, /shouldShowBanner: true, shouldShowList: true/);
});

test('badge reconciliation reads canonical backend value and explicitly writes zero', () => {
  assert.match(badge, /notificationsAPI\.badge\(\)/);
  assert.match(badge, /Number\(canonical\?\.badge\) \|\| 0/);
  assert.match(push, /clearPushEventDedup/);
});

test('client receipt ACK is diagnostic and carries only event/install metadata', () => {
  assert.match(push, /async acknowledgeReceipt\(eventId/);
  assert.match(push, /fetch\(`\$\{BASE\}\/receipt`/);
  assert.match(push, /event_id: eventId\.trim\(\), device_id: deviceId, opened/);
  assert.doesNotMatch(push, /body:\s*JSON\.stringify\(\{[^}]*message_text/);
});
