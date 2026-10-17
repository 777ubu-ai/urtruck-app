/* Active-trip one-shot GPS and legacy client compatibility contract. */
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
const locationCopy = read('src/utils/locationModeCopy.js');

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
// FINAL 10/10 AUDIT (2026-09-14): the native map moved off the Yandex
// WebView onto Yandex MapKit (698d085b, "feat(map): перевести мобильную
// карту на Yandex MapKit") — this assertion still checked the old testID,
// which made it abort the entire smoke on assertion #9 of ~83, so the rest
// of this file's contract (most of the Android background-location / Play
// compliance checks below) was silently never measured in CI. Product
// behaviour itself was already correct — verified by this fix's own full
// clean run of the whole file, see the commit message.
must(nativeMap, 'truck-map-yandex-mapkit', 'Android route map remains embedded in UrTruck');
mustNot(nativeMap, 'requestLocationPermissionThroughDisclosure', 'opening Android map cannot request tracking permission');
mustNot(nativeMap, "source: 'open_map'", 'map-open is not a GPS consent trigger');
mustNot(nativeMap, 'permissionGate', 'planned map is not hidden behind a GPS consent gate');
mustNot(nativeMap, 'Linking.openURL', 'native route map cannot launch an external maps app');
mustNot(webMap, 'Linking.openURL', 'web route map cannot launch an external maps app');
mustNot(routeMap, 'Linking.openURL', 'route CTA cannot launch an external maps app');
must(routeMap, 'route-map-fullscreen', 'route CTA has an in-app fullscreen map');
must(tracker, "requestLocationPermissionThroughDisclosure({ source: 'start_trip' })", 'Start trip is the location disclosure trigger');
must(tracker, 'getBackgroundLocationPermissionState()', 'location service checks existing grants');
must(tracker, 'FOREGROUND_LOCATION_ONLY = true', 'snapshot runtime is explicit');
must(tracker, 'return { ...fg, foregroundOnly: true }', 'snapshot trip needs foreground grant only');
must(locationCopy, 'Местоположение определяется один раз при открытии карты рейса', 'current disclosure explains one-shot map capture');
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
]) {
  if (!permissions.includes(required)) throw new Error(`GPS consent contract missing Android permission: ${required}`);
  console.log(`  ✓ Android permission ${required}`);
}
mustNot(manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION', 'native manifest excludes background location permission');
mustNot(manifest, 'android.permission.FOREGROUND_SERVICE_LOCATION', 'native manifest excludes location foreground-service permission');

const locationPlugin = (app.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
if (locationPlugin?.[1]?.isAndroidForegroundServiceEnabled !== false) throw new Error('Snapshot build unexpectedly enables Android location service');
if (locationPlugin?.[1]?.isAndroidBackgroundLocationEnabled !== false) throw new Error('Snapshot build unexpectedly enables Android background location');
if (locationPlugin?.[1]?.isIosBackgroundLocationEnabled !== false) throw new Error('Snapshot build unexpectedly enables iOS background location');
console.log('  ✓ expo-location snapshot mode excludes native background location');

must(playDoc, 'ACCESS_BACKGROUND_LOCATION', 'Play release doc covers Android background permission');
must(playDoc, 'Snapshot release mode', 'Play release doc names current snapshot contract');
must(playDoc, 'DealWorkspaceRoute.js', 'Play release doc names canonical gated route');
must(agentsDoc, 'разовое определение на открытой карте', 'AGENTS marks current snapshot rule');
must(claudeDoc, 'разовое определение на открытой карте', 'CLAUDE marks current snapshot rule');
must(privacy, 'в фоновом режиме', 'public privacy policy discloses background location');
must(privacy, 'только авторизованным участникам соответствующей сделки', 'privacy policy limits live location to deal participants');
must(privacy, 'Геолокация не используется для рекламы', 'privacy policy rules out advertising use');

must(routeMap, '<TruckMap', 'trip renders embedded route map inside UrTruck');

console.log('\n[gps-consent] OK — Start-trip consent + map-only snapshot + legacy client boundary');
