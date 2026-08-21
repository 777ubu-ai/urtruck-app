import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const gate = read('src/components/deal/DealLocationPermissionGate.js');
const routeHost = read('src/components/deal/DealWorkspaceRoute.js');
const disclosure = read('src/components/deal/BackgroundLocationDisclosureModal.js');
const tracker = read('src/utils/backgroundLocation.js');
const settingsHelper = read('src/utils/locationSettings.js');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const chat = read('src/screens/ChatScreenV2.js');
const cargo = read('src/screens/CargoDetailV2.js');
const trip = read('src/screens/TripDetailV2.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = JSON.parse(read('app.json')).expo;

test('trip disclosure matches Play background-location behavior', () => {
  assert.match(disclosure, /Отслеживать рейс/);
  assert.match(disclosure, /собирает данные о местоположении автомобиля/);
  assert.match(disclosure, /передаёт их грузоотправителю/);
  assert.match(disclosure, /в фоновом режиме/);
  assert.match(disclosure, /приложение свёрнуто или не отображается на экране/);
  assert.match(disclosure, /Передача геолокации прекращается после завершения или отмены рейса/);
  assert.match(disclosure, /Location sharing can continue in the background/);
  assert.match(disclosure, /Разрешить и начать рейс/);
  assert.match(disclosure, /Не сейчас/);
  assert.match(disclosure, /Разрешить всегда/);
  assert.match(disclosure, /testID="background-location-disclosure"/);
  assert.match(disclosure, /testID="background-location-disclosure-continue"/);
});

test('accepted driver has no proactive location permission control', () => {
  assert.doesNotMatch(gate, /deal-background-location-bar/);
  assert.doesNotMatch(gate, /deal-background-location-allow/);
  assert.doesNotMatch(gate, /dealStatus === 'accepted'/);
  assert.match(gate, /effectiveRole === 'driver'/);
  assert.match(gate, /registerLocationPermissionRequestHandler\(beginDisclosure\)/);
});

test('all accepted-deal entry points use one canonical disclosure host', () => {
  assert.match(routeHost, /DealLocationPermissionGate/);
  assert.match(routeHost, /DealWorkspaceScreenV2/);
  assert.match(routeHost, /<DealLocationPermissionGate role=\{params\.role\}>/);
  for (const [name, source] of [
    ['ChatScreenV2', chat],
    ['CargoDetailV2', cargo],
    ['TripDetailV2', trip],
  ]) {
    assert.match(source, /DealWorkspaceRoute/, `${name} must use canonical gated deal route`);
    assert.doesNotMatch(source, /from ['"]\.\/DealWorkspaceScreenV2['"]/, `${name} must not bypass location host`);
    assert.doesNotMatch(source, /DealLocationPermissionGate/, `${name} must not build a second ad-hoc permission host`);
  }

  const screenFiles = fs.readdirSync('src/screens').filter((name) => name.endsWith('.js') && name !== 'DealWorkspaceScreenV2.js');
  for (const name of screenFiles) {
    const source = read(`src/screens/${name}`);
    assert.doesNotMatch(source, /from ['"]\.\/DealWorkspaceScreenV2['"]/, `${name} imports raw DealWorkspaceScreenV2`);
  }
});

test('Android and web use the same per-trip disclosure from Start trip', () => {
  assert.match(gate, /Platform\.OS === 'android' \|\| Platform\.OS === 'web'/);
  assert.match(tracker, /Platform\.OS === 'android' \|\| Platform\.OS === 'web'/);
  assert.match(gate, /Per-trip consent is intentional/);
  assert.match(tracker, /requestLocationPermissionThroughDisclosure\(\{ source: 'start_trip' \}\)/);
});

test('Android permission sequence is Start trip disclosure then foreground and always background', () => {
  const disclosureIndex = gate.indexOf("setModalMode('disclosure')");
  const foregroundIndex = gate.indexOf('requestForegroundLocationPermission()');
  assert.ok(disclosureIndex >= 0 && foregroundIndex >= 0);
  assert.ok(disclosureIndex < foregroundIndex, 'disclosure must be wired before foreground permission');
  assert.match(gate, /requestBackgroundLocationPermission\(\)/);
  assert.match(gate, /foregroundService: Platform\.OS === 'android'/);
  assert.match(gate, /openLocationSettings\(\)/);
  assert.match(disclosure, /background-location-open-settings/);
});

test('web denied recovery never offers or calls native app settings', () => {
  assert.match(disclosure, /canOpenNativeSettings = Platform\.OS !== 'web'/);
  assert.match(disclosure, /Откройте настройки сайта в браузере/);
  assert.match(disclosure, /background-location-check-again/);
  assert.match(gate, /busy \|\| Platform\.OS === 'web'/);
  assert.match(settingsHelper, /Platform\.OS === 'web'[\s\S]*web_settings_manual/);
  assert.match(settingsHelper, /typeof Linking\?\.openSettings !== 'function'/);
  assert.match(tracker, /export \{ openLocationSettings \} from '\.\/locationSettings'/);
});

test('start trip cannot enter in_progress before permission succeeds', () => {
  const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
  const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
  assert.ok(permissionIndex >= 0 && statusIndex >= 0);
  assert.ok(permissionIndex < statusIndex);
  assert.match(routeHost, /<DealLocationPermissionGate/);
  assert.match(tracker, /requestLocationPermissionThroughDisclosure\(\{ source: 'start_trip' \}\)/);
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

test('Android config declares background location and keeps location foreground service', () => {
  assert.equal(app.android.versionCode, 9);
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_FINE_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_COARSE_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.FOREGROUND_SERVICE'));
  assert.ok(app.android.permissions.includes('android.permission.FOREGROUND_SERVICE_LOCATION'));
  assert.ok(app.android.permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION'));
  assert.match(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/);
  assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);

  const plugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
  assert.equal(plugin?.[1]?.isAndroidForegroundServiceEnabled, true);
  assert.equal(plugin?.[1]?.isAndroidBackgroundLocationEnabled, true);
  assert.equal(plugin?.[1]?.isIosBackgroundLocationEnabled, true);
});

test('Android permission state requires foreground and background grants for the trip service', () => {
  assert.match(tracker, /Platform\.OS === 'android'/);
  assert.match(tracker, /background: bg\.status/);
  assert.match(tracker, /ok: fg\.status === 'granted' && bg\.status === 'granted'/);
  assert.match(tracker, /backgroundRequired: true/);
  assert.match(tracker, /foregroundService: true/);
});
