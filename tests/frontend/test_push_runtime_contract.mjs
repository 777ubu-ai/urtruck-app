import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPushPermissionMonitor } from '../../src/utils/pushPermissionMonitor.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const appJson = JSON.parse(read('app.json'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
const push = read('src/utils/push.js');
const pushBanner = read('src/components/PushPermissionBanner.js');
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

test('push permission monitor handles grant, revoke, failed reads, and unmount', async () => {
  let stateListener;
  let permission = 'denied';
  let reads = 0;
  let registrations = 0;
  let removals = 0;
  const observed = [];
  const appState = {
    addEventListener(event, listener) {
      assert.equal(event, 'change');
      stateListener = listener;
      return { remove: () => { removals += 1; } };
    },
  };
  const monitor = createPushPermissionMonitor({
    appState,
    getPermission: async () => {
      reads += 1;
      if (permission instanceof Error) throw permission;
      return permission;
    },
    onPermission: (value) => observed.push(value),
    onGranted: () => { registrations += 1; },
  });

  assert.equal(await monitor.refresh(), 'denied');
  assert.deepEqual(observed, ['denied']);

  permission = 'granted';
  await stateListener('active');
  assert.equal(observed.at(-1), 'granted');
  assert.equal(registrations, 1);
  await stateListener('active');
  assert.equal(registrations, 1, 'unchanged grant must not re-register on every foreground');

  permission = 'denied';
  await stateListener('active');
  assert.equal(observed.at(-1), 'denied');
  assert.equal(registrations, 1);

  permission = new Error('permission API unavailable');
  await stateListener('active');
  assert.equal(observed.at(-1), 'unknown');

  const readsBeforeUnmount = reads;
  monitor.remove();
  monitor.remove();
  assert.equal(removals, 1, 'listener cleanup must be idempotent');
  await stateListener('active');
  assert.equal(reads, readsBeforeUnmount, 'unmounted monitor must ignore foreground events');
  assert.deepEqual(observed, ['denied', 'granted', 'granted', 'denied', 'unknown']);
});

test('push permission banner wires native foreground monitor and cleans it up', () => {
  assert.match(pushBanner, /AppState, Platform/);
  assert.match(pushBanner, /createPushPermissionMonitor/);
  assert.match(pushBanner, /monitor\.remove\(\)/);
  assert.match(pushBanner, /push\.autoRegister\(\)\.catch/);
});

test('iOS has APNs entitlement and foreground presentation handler', () => {
  assert.match(entitlements, /<key>aps-environment<\/key>/);
  assert.match(push, /Notifications\.setNotificationHandler/);
  assert.match(push, /shouldShowBanner: true, shouldShowList: true/);
});

test('badge reconciliation reads canonical backend value and explicitly writes zero', () => {
  assert.match(badge, /notificationsAPI\.badge\(\)/);
  assert.match(badge, /normalizedBadge\(canonical\?\.badge\)/);
  assert.match(badge, /launcher_badge_unsupported/);
  assert.match(badge, /return \{ badge, applied: false, reason \}/);
  assert.match(push, /clearPushEventDedup/);
});

test('client receipt ACK is diagnostic and carries only event/install metadata', () => {
  assert.match(push, /async acknowledgeReceipt\(eventId/);
  assert.match(push, /fetch\(`\$\{BASE\}\/receipt`/);
  assert.match(push, /event_id: eventId\.trim\(\), device_id: deviceId, opened/);
  assert.doesNotMatch(push, /body:\s*JSON\.stringify\(\{[^}]*message_text/);
});
