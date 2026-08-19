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
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = JSON.parse(read('app.json')).expo;

test('trip disclosure explains Android foreground-service tracking without all-time permission', () => {
  assert.match(disclosure, /Геолокация во время рейса/);
  assert.match(disclosure, /системный сервис с постоянным уведомлением/);
  assert.match(disclosure, /Передача геолокации прекращается после завершения или отмены рейса/);
  assert.doesNotMatch(disclosure, /когда приложение закрыто или не используется/);
  assert.match(disclosure, /не просит доступ «Разрешить всегда»/);
  assert.match(disclosure, /testID="background-location-disclosure"/);
  assert.match(disclosure, /testID="background-location-disclosure-continue"/);
});

test('accepted Android driver gets contextual location action, shipper does not', () => {
  assert.match(gate, /Platform\.OS === 'android' && isDriver && dealStatus === 'accepted'/);
  assert.match(gate, /testID="deal-background-location-bar"/);
  assert.match(gate, /testID="deal-background-location-allow"/);
  assert.match(gate, /effectiveRole === 'driver'/);
});

test('Android permission sequence is disclosure then foreground only', () => {
  const disclosureIndex = gate.indexOf("setModalMode('disclosure')");
  const foregroundIndex = gate.indexOf('requestForegroundLocationPermission()');
  assert.ok(disclosureIndex >= 0 && foregroundIndex >= 0);
  assert.ok(disclosureIndex < foregroundIndex, 'disclosure must be wired before foreground permission');
  assert.doesNotMatch(gate, /requestBackgroundLocationPermission/);
  assert.match(gate, /foregroundService: true/);
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
  assert.match(startFn, /foregroundService:/);
  assert.doesNotMatch(startFn, /requestForegroundLocationPermission\(\)/);
  assert.doesNotMatch(startFn, /requestBackgroundLocationPermission\(\)/);
});

test('Android location foreground service starts only while app is visible', () => {
  assert.match(hook, /AppState\.currentState !== 'active'/);
  assert.match(hook, /state === 'active'/);
  assert.match(hook, /startBackgroundTracking\(\)/);
});

test('Android config omits background location and keeps location foreground service', () => {
  assert.equal(app.android.versionCode, 9);
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_FINE_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_COARSE_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.FOREGROUND_SERVICE'));
  assert.ok(app.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'));
  assert.ok(!app.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.doesNotMatch(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);

  const plugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
  assert.equal(plugin?.[1]?.isAndroidForegroundServiceEnabled, true);
  assert.equal(plugin?.[1]?.isAndroidBackgroundLocationEnabled, false);
  assert.equal(plugin?.[1]?.isIosBackgroundLocationEnabled, true);
});

test('Android permission state treats foreground grant as sufficient for the trip service', () => {
  assert.match(tracker, /Platform\.OS === 'android'/);
  assert.match(tracker, /background: 'not_required_foreground_service'/);
  assert.match(tracker, /ok: fg\.status === 'granted'/);
  assert.match(tracker, /foregroundService: true/);
});