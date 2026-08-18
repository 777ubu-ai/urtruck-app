import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const gate = read('src/components/deal/DealLocationPermissionGate.js');
const disclosure = read('src/components/deal/BackgroundLocationDisclosureModal.js');
const tracker = read('src/utils/backgroundLocation.js');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const chat = read('src/screens/ChatScreenV2.js');
const app = JSON.parse(read('app.json')).expo;

test('Google Play disclosure is prominent and explicit about background use', () => {
  assert.match(disclosure, /Геолокация во время рейса/);
  assert.match(disclosure, /в фоновом режиме/);
  assert.match(disclosure, /когда приложение закрыто или не используется/);
  assert.match(disclosure, /Передача прекращается после завершения или отмены рейса/);
  assert.match(disclosure, /testID="background-location-disclosure"/);
  assert.match(disclosure, /testID="background-location-disclosure-continue"/);
});

test('accepted Android driver gets contextual location action, shipper does not', () => {
  assert.match(gate, /Platform\.OS === 'android' && isDriver && dealStatus === 'accepted'/);
  assert.match(gate, /testID="deal-background-location-bar"/);
  assert.match(gate, /testID="deal-background-location-allow"/);
  assert.match(gate, /effectiveRole === 'driver'/);
});

test('permission sequence is disclosure then foreground then background/settings', () => {
  const disclosureIndex = gate.indexOf("setModalMode('disclosure')");
  const foregroundIndex = gate.indexOf('requestForegroundLocationPermission()');
  const backgroundIndex = gate.indexOf('requestBackgroundLocationPermission()');
  assert.ok(disclosureIndex >= 0 && foregroundIndex >= 0 && backgroundIndex >= 0);
  assert.ok(disclosureIndex < foregroundIndex, 'disclosure must be wired before foreground permission');
  assert.ok(foregroundIndex < backgroundIndex, 'foreground must be requested before background');
  assert.match(gate, /openLocationSettings\(\)/);
  assert.match(disclosure, /background-location-open-settings/);
});

test('start trip cannot enter in_progress before permission succeeds', () => {
  const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
  const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
  assert.ok(permissionIndex >= 0 && statusIndex >= 0);
  assert.ok(permissionIndex < statusIndex);
  assert.match(chat, /<DealLocationPermissionGate/);
  assert.match(tracker, /requestLocationPermissionThroughDisclosure/);
});

test('background broadcaster never opens runtime permission prompts', () => {
  assert.match(hook, /getForegroundPermissionsAsync\(\)/);
  assert.doesNotMatch(hook, /requestForegroundPermissionsAsync\(\)/);
  assert.doesNotMatch(hook, /requestBackgroundPermissionsAsync\(\)/);

  const startFn = tracker.split('export async function startBackgroundTracking()')[1] || '';
  assert.match(startFn, /getBackgroundLocationPermissionState\(\)/);
  assert.doesNotMatch(startFn, /requestForegroundLocationPermission\(\)/);
  assert.doesNotMatch(startFn, /requestBackgroundLocationPermission\(\)/);
});

test('Android config declares background location and foreground-service location', () => {
  assert.equal(app.android.versionCode, 9);
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'));
  const plugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
  assert.equal(plugin?.[1]?.isAndroidBackgroundLocationEnabled, true);
});
