import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const gate = read('src/components/deal/DealLocationPermissionGate.js');
const routeHost = read('src/components/deal/DealWorkspaceRoute.js');
const disclosure = read('src/components/deal/BackgroundLocationDisclosureModal.js');
const tracker = read('src/utils/backgroundLocation.js');
const coordinator = read('src/utils/locationPermissionCoordinator.js');
const nativeMap = read('src/components/TruckMap.native.js');
const settingsHelper = read('src/utils/locationSettings.js');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const chat = read('src/screens/ChatScreenV2.js');
const cargo = read('src/screens/CargoDetailV2.js');
const trip = read('src/screens/TripDetailV2.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = JSON.parse(read('app.json')).expo;

test('prominent disclosure matches Play background-location behavior', () => {
  assert.match(disclosure, /Разрешить GPS-отслеживание\?/);
  assert.match(disclosure, /точное местоположение автомобиля/);
  assert.match(disclosure, /передавать его грузоотправителю/);
  assert.match(disclosure, /в фоновом режиме/);
  assert.match(disclosure, /приложение свёрнуто/);
  assert.match(disclosure, /экран телефона выключен/);
  assert.match(disclosure, /Передача GPS прекращается после завершения или отмены рейса/);
  assert.match(disclosure, /Location data is also used in the background/);
  assert.match(disclosure, /Согласен и продолжить/);
  assert.match(disclosure, /Не согласен/);
  assert.match(disclosure, /Разрешите геолокацию всегда/);
  assert.match(disclosure, /testID="background-location-disclosure"/);
  assert.match(disclosure, /testID="background-location-disclosure-continue"/);
});

test('Android trip map is viewable without starting the tracking permission flow', () => {
  assert.doesNotMatch(nativeMap, /requestLocationPermissionThroughDisclosure/);
  assert.doesNotMatch(nativeMap, /source: ['"]open_map['"]/);
  assert.doesNotMatch(nativeMap, /permissionGate/);
  assert.doesNotMatch(nativeMap, /truck-map-location-consent-gate/);
  assert.doesNotMatch(nativeMap, /truck-map-location-consent-retry/);
  assert.match(nativeMap, /testID="truck-map-yandex-webview"/);
});

test('canonical deal host handles Start trip consent only', () => {
  assert.match(gate, /effectiveRole === 'driver'/);
  assert.match(gate, /registerLocationPermissionRequestHandler\(beginDisclosure\)/);
  assert.match(gate, /if \(!isDriver\) return \{ ok: true, notRequired: true/);
  assert.match(tracker, /requestLocationPermissionThroughDisclosure\(\{ source: 'start_trip' \}\)/);
  assert.match(coordinator, /waitForRequestHandler/);
  assert.doesNotMatch(nativeMap, /requestLocationPermissionThroughDisclosure/);
});

test('all accepted-deal entry points use one canonical disclosure host', () => {
  assert.match(routeHost, /DealLocationPermissionGate/);
  assert.match(routeHost, /DealWorkspaceScreenV2/);
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

test('Android permission sequence is disclosure then foreground then explicit settings', () => {
  const disclosureIndex = gate.indexOf("setModalMode('disclosure')");
  const foregroundIndex = gate.indexOf('requestForegroundLocationPermission()');
  assert.ok(disclosureIndex >= 0 && foregroundIndex >= 0);
  assert.ok(disclosureIndex < foregroundIndex, 'disclosure must be wired before foreground permission');
  assert.doesNotMatch(gate, /requestBackgroundLocationPermission\(\)/);
  assert.match(gate, /setModalMode\('settings'\)/);
  assert.match(gate, /openLocationSettings\(\)/);
  assert.match(gate, /AppState\.addEventListener/);
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

test('Start trip cannot enter in_progress before permission succeeds', () => {
  const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
  const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
  assert.ok(permissionIndex >= 0 && statusIndex >= 0);
  assert.ok(permissionIndex < statusIndex);
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
  assert.equal(app.android.versionCode, 28);
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
