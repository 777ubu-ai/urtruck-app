/* Active-trip GPS + Android background-location compliance contract. */
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const api = read('backend/api/marketplace.py');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const tracker = read('src/utils/backgroundLocation.js');
const coordinator = read('src/utils/locationPermissionCoordinator.js');
const gate = read('src/components/deal/DealLocationPermissionGate.js');
const routeHost = read('src/components/deal/DealWorkspaceRoute.js');
const disclosure = read('src/components/deal/BackgroundLocationDisclosureModal.js');
const nativeMap = read('src/components/TruckMap.native.js');
const webMap = read('src/components/TruckMap.web.js');
const chatV2 = read('src/screens/ChatScreenV2.js');
const cargoV2 = read('src/screens/CargoDetailV2.js');
const tripV2 = read('src/screens/TripDetailV2.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const routeMap = read('src/components/RouteMap.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = JSON.parse(read('app.json')).expo;
const playDoc = read('docs/release/google-play-background-location.md');
const agentsDoc = read('AGENTS.md');
const claudeDoc = read('CLAUDE.md');
const privacy = read('web/legal/privacy.html');

const must = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`GPS consent contract missing: ${label}`);
  console.log(`  ✓ ${label}`);
};
const mustNot = (source, needle, label) => {
  if (source.includes(needle)) throw new Error(`GPS consent contract violation: ${label}`);
  console.log(`  ✓ ${label}`);
};

must(api, 'tracking.get("status") != "active"', 'location upload blocked without active deal consent');
must(api, 'tracking_started_with_trip', 'start trip activates tracking atomically');
must(api, 'completed_at=CURRENT_TIMESTAMP', 'completion closes tracking record');

must(hook, 'marketAPI.activeTrackingDeals()', 'location task takes server-approved IDs');
must(hook, 'getForegroundPermissionsAsync()', 'foreground broadcaster only reads existing grant');
mustNot(hook, 'requestForegroundPermissionsAsync()', 'background hook does not request foreground permission');
mustNot(hook, 'requestBackgroundPermissionsAsync()', 'background hook does not request background permission');
must(hook, "AppState.currentState !== 'active'", 'Android service never starts while app is already backgrounded');

// Viewing a route is independent from tracking permission. Only Start trip may
// enter the disclosure/foreground/background permission sequence.
must(nativeMap, 'truck-map-yandex-webview', 'Android route map remains embedded in UrTruck');
mustNot(nativeMap, 'requestLocationPermissionThroughDisclosure', 'opening Android map cannot request tracking permission');
mustNot(nativeMap, "source: 'open_map'", 'map-open is not a GPS consent trigger');
mustNot(nativeMap, 'permissionGate', 'planned map is not hidden behind a GPS consent gate');
mustNot(nativeMap, 'Linking.openURL', 'native route map cannot launch an external maps app');
mustNot(webMap, 'Linking.openURL', 'web route map cannot launch an external maps app');
mustNot(routeMap, 'Linking.openURL', 'route CTA cannot launch an external maps app');
must(routeMap, 'route-map-fullscreen', 'route CTA has an in-app fullscreen map');
must(tracker, "requestLocationPermissionThroughDisclosure({ source: 'start_trip' })", 'Start trip is the location disclosure trigger');
must(tracker, 'getBackgroundLocationPermissionState()', 'location service checks existing grants');
must(tracker, 'backgroundRequired: true', 'Android permission state requires background access for the trip service');
must(tracker, "ok: fg.status === 'granted' && bg.status === 'granted'", 'Android permission state requires foreground and background grants');
must(tracker, 'foregroundService:', 'active-trip updates use a location foreground service');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestForegroundLocationPermission()', 'location service cannot ask foreground permission');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestBackgroundLocationPermission()', 'location service cannot ask background permission');
must(coordinator, 'registerLocationPermissionRequestHandler', 'visible deal screen can register disclosure host');
must(coordinator, 'waitForRequestHandler', 'coordinator closes parent/child mount race');
must(coordinator, 'disclosure_host_unavailable', 'screens without a disclosure host are distinguishable');

must(disclosure, 'Разрешить GPS-отслеживание?', 'prominent disclosure has explicit GPS consent title');
must(disclosure, 'точное местоположение автомобиля', 'disclosure says precise vehicle location is used');
must(disclosure, 'передавать его грузоотправителю', 'disclosure says who receives location data');
must(disclosure, 'в фоновом режиме', 'disclosure explicitly names background use');
must(disclosure, 'приложение свёрнуто', 'disclosure explains minimized behavior');
must(disclosure, 'экран телефона выключен', 'disclosure explains screen-off behavior');
must(disclosure, 'Передача GPS прекращается после завершения или отмены рейса', 'disclosure explains when tracking stops');
must(disclosure, 'Location data is also used in the background', 'English disclosure explicitly names background use');
must(disclosure, 'Согласен и продолжить', 'primary disclosure action is explicit consent');
must(disclosure, 'Не согласен', 'secondary disclosure action is explicit refusal');
must(disclosure, 'Разрешите геолокацию всегда', 'settings recovery explains Always/background requirement');
must(disclosure, 'background-location-disclosure-continue', 'disclosure has explicit consent action');
must(disclosure, 'background-location-open-settings', 'background permission settings path is visible');

must(gate, "effectiveRole === 'driver'", 'deal host knows driver role');
must(gate, "Platform.OS === 'android' || Platform.OS === 'web'", 'disclosure host supports Android and web');
must(gate, 'registerLocationPermissionRequestHandler(beginDisclosure)', 'canonical deal screen registers one disclosure handler');
must(gate, 'requestForegroundLocationPermission()', 'foreground permission is requested only after disclosure');
mustNot(gate, 'requestBackgroundLocationPermission()', 'Android gate does not auto-launch background permission request');
must(gate, "setModalMode('settings')", 'Android moves to explicit settings step for Always permission');
must(gate, 'openLocationSettings()', 'settings path exists for Android permission recovery');
must(gate, 'AppState.addEventListener', 'return from Android settings rechecks permission');
must(gate, "setModalMode('disclosure')", 'permission flow begins with in-app disclosure');

must(routeHost, 'DealLocationPermissionGate', 'canonical deal route owns the disclosure host');
must(routeHost, 'DealWorkspaceScreenV2', 'canonical deal route renders the real workspace');
for (const [source, label] of [
  [chatV2, 'chat deal entry'],
  [cargoV2, 'cargo detail deal entry'],
  [tripV2, 'trip detail deal entry'],
]) {
  must(source, 'DealWorkspaceRoute', `${label} uses canonical gated route`);
  mustNot(source, "from './DealWorkspaceScreenV2'", `${label} cannot import raw deal workspace`);
  mustNot(source, 'DealLocationPermissionGate', `${label} cannot build an ad-hoc permission host`);
}

must(workspace, 'ensureBackgroundLocationPermission()', 'start trip checks location permission');
const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
if (permissionIndex < 0 || statusIndex < 0 || permissionIndex > statusIndex) {
  throw new Error('GPS consent contract violation: deal becomes in_progress before permission succeeds');
}
console.log('  ✓ start trip waits for permission before FSM transition');

const permissions = app.android?.permissions || [];
for (const required of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
]) {
  if (!permissions.includes(required)) throw new Error(`GPS consent contract missing Android permission: ${required}`);
  console.log(`  ✓ Android permission ${required}`);
}
must(manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION', 'native manifest keeps Android background location permission');
must(manifest, 'android.permission.FOREGROUND_SERVICE_LOCATION', 'native manifest keeps location foreground-service permission');

const locationPlugin = (app.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
if (locationPlugin?.[1]?.isAndroidForegroundServiceEnabled !== true) throw new Error('GPS consent contract missing: expo-location Android foreground service mode');
if (locationPlugin?.[1]?.isAndroidBackgroundLocationEnabled !== true) throw new Error('GPS consent contract missing: expo-location Android background mode');
if (locationPlugin?.[1]?.isIosBackgroundLocationEnabled !== true) throw new Error('GPS consent contract missing: iOS background location mode');
console.log('  ✓ expo-location Android foreground/background location modes enabled');

must(playDoc, 'ACCESS_BACKGROUND_LOCATION', 'Play release doc covers Android background permission');
must(playDoc, 'isAndroidBackgroundLocationEnabled: true', 'Play release doc matches Expo Android config');
must(playDoc, 'DealWorkspaceRoute.js', 'Play release doc names canonical gated route');
mustNot(playDoc, 'не использует `ACCESS_BACKGROUND_LOCATION`', 'Play release doc does not claim background permission is absent');
mustNot(playDoc, 'не содержит `ACCESS_BACKGROUND_LOCATION`', 'Play checklist does not require removing background permission');
must(agentsDoc, 'Фоновая геолокация Android включена', 'AGENTS current GPS rule is enabled');
mustNot(agentsDoc, 'Фоновая геолокация Android отключена', 'AGENTS has no obsolete disabled GPS rule');
must(claudeDoc, 'Android GPS: background location активного рейса', 'CLAUDE current GPS rule is enabled');
mustNot(claudeDoc, 'Временно отключено: фоновая геолокация Android', 'CLAUDE has no obsolete disabled GPS section');
must(privacy, 'в фоновом режиме', 'public privacy policy discloses background location');
must(privacy, 'только авторизованным участникам соответствующей сделки', 'privacy policy limits live location to deal participants');
must(privacy, 'Геолокация не используется для рекламы', 'privacy policy rules out advertising use');

must(routeMap, '<TruckMap', 'trip renders embedded route map inside UrTruck');

console.log('\n[gps-consent] OK — Start-trip-only consent + embedded route + Android background-location contract');