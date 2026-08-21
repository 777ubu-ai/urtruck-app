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
const chatV2 = read('src/screens/ChatScreenV2.js');
const cargoV2 = read('src/screens/CargoDetailV2.js');
const tripV2 = read('src/screens/TripDetailV2.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const routeMap = read('src/components/RouteMap.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');
const app = JSON.parse(read('app.json')).expo;

const must = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`GPS consent contract missing: ${label}`);
  console.log(`  ✓ ${label}`);
};
const mustNot = (source, needle, label) => {
  if (source.includes(needle)) throw new Error(`GPS consent contract violation: ${label}`);
  console.log(`  ✓ ${label}`);
};

// Backend remains authoritative: no location upload without an active deal and
// start-trip atomically activates the tracking permission record.
must(api, 'tracking.get("status") != "active"', 'location upload blocked without active deal consent');
must(api, 'tracking_started_with_trip', 'start trip activates tracking atomically');
must(api, 'completed_at=CURRENT_TIMESTAMP', 'completion closes tracking record');

// Background hooks are passive. They may read existing permission, but must
// never surprise the user with a runtime permission dialog.
must(hook, 'marketAPI.activeTrackingDeals()', 'location task takes server-approved IDs');
must(hook, 'getForegroundPermissionsAsync()', 'foreground broadcaster only reads existing grant');
mustNot(hook, 'requestForegroundPermissionsAsync()', 'background hook does not request foreground permission');
mustNot(hook, 'requestBackgroundPermissionsAsync()', 'background hook does not request background permission');
must(hook, "AppState.currentState !== 'active'", 'Android service never starts while app is already backgrounded');

// Start trip is the single permission trigger. Android and web use the same
// per-trip disclosure; Android then requests foreground permission first and
// guides the user to enable Always/background access when Android stops at
// "While using the app".
must(tracker, "Platform.OS === 'android' || Platform.OS === 'web'", 'Android and web route Start trip through the disclosure coordinator');
must(tracker, "requestLocationPermissionThroughDisclosure({ source: 'start_trip' })", 'Start trip requests permission through disclosure coordinator');
must(tracker, 'getBackgroundLocationPermissionState()', 'location service checks existing grants');
must(tracker, 'backgroundRequired: true', 'Android permission state requires background access for the trip service');
must(tracker, "ok: fg.status === 'granted' && bg.status === 'granted'", 'Android permission state requires foreground and background grants');
must(tracker, 'foregroundService:', 'active-trip updates use a location foreground service');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestForegroundLocationPermission()', 'location service cannot ask foreground permission');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestBackgroundLocationPermission()', 'location service cannot ask background permission');
must(coordinator, 'registerLocationPermissionRequestHandler', 'visible deal screen can register disclosure host');
must(coordinator, 'disclosure_host_unavailable', 'screens without a disclosure host fail closed');

// Prominent disclosure explicitly explains collection, sharing, background use,
// and the exact stop condition before Android runtime permission.
must(disclosure, 'Отслеживать рейс', 'prominent disclosure uses the approved feature title');
must(disclosure, 'собирает данные о местоположении автомобиля', 'disclosure says location data is collected');
must(disclosure, 'передаёт их грузоотправителю', 'disclosure says who receives location data');
must(disclosure, 'в фоновом режиме', 'disclosure explicitly names background use');
must(disclosure, 'приложение свёрнуто или не отображается на экране', 'disclosure explains minimized/not-visible behavior');
must(disclosure, 'Передача геолокации прекращается после завершения или отмены рейса', 'disclosure explains when tracking stops');
must(disclosure, 'Location sharing can continue in the background', 'English disclosure explicitly names background use');
must(disclosure, 'Разрешить и начать рейс', 'primary disclosure action matches the user intent');
must(disclosure, 'Не сейчас', 'secondary disclosure action is explicit');
must(disclosure, 'Разрешить всегда', 'settings recovery explains the Always/background requirement');
must(disclosure, 'background-location-disclosure-continue', 'disclosure has explicit start-trip consent action');
must(disclosure, 'background-location-open-settings', 'background permission settings path is visible');

// No proactive permission card exists. The modal is registered only while a
// driver is inside the canonical accepted-deal route.
must(gate, "effectiveRole === 'driver'", 'disclosure host is driver-only');
must(gate, "Platform.OS === 'android' || Platform.OS === 'web'", 'disclosure host supports Android and web');
must(gate, 'Per-trip consent is intentional', 'approved modal is shown for every new trip start');
must(gate, 'registerLocationPermissionRequestHandler(beginDisclosure)', 'driver deal screen registers Start-trip disclosure handler');
must(gate, 'requestForegroundLocationPermission()', 'foreground permission is requested after disclosure');
must(gate, 'requestBackgroundLocationPermission()', 'Android deal gate requests Always/background access after foreground permission');
mustNot(gate, 'deal-background-location-bar', 'accepted deal has no proactive location permission bar');
mustNot(gate, 'deal-background-location-allow', 'accepted deal has no separate Allow button');
mustNot(gate, "dealStatus === 'accepted'", 'permission UI is not driven by a pre-trip status banner');
must(gate, 'openLocationSettings()', 'settings path exists for Android permission recovery');
must(gate, "setModalMode('disclosure')", 'permission flow begins with in-app disclosure');

// Every real accepted-deal entry point must use the same route host. This is
// what prevents CargoDetail/TripDetail/deep navigation from reaching Start trip
// with no registered permission handler.
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

// Start trip must block the FSM transition until permission returns ok.
must(workspace, 'ensureBackgroundLocationPermission()', 'start trip checks location permission');
const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
if (permissionIndex < 0 || statusIndex < 0 || permissionIndex > statusIndex) {
  throw new Error('GPS consent contract violation: deal becomes in_progress before permission succeeds');
}
console.log('  ✓ start trip waits for permission before FSM transition');

// Android declares the foreground service plus background location required by
// Expo's background-location task. iOS background location remains configured separately.
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
if (locationPlugin?.[1]?.isAndroidForegroundServiceEnabled !== true) {
  throw new Error('GPS consent contract missing: expo-location Android foreground service mode');
}
if (locationPlugin?.[1]?.isAndroidBackgroundLocationEnabled !== true) {
  throw new Error('GPS consent contract missing: expo-location Android background mode');
}
if (locationPlugin?.[1]?.isIosBackgroundLocationEnabled !== true) {
  throw new Error('GPS consent contract missing: iOS background location mode');
}
console.log('  ✓ expo-location Android foreground/background location modes enabled');

must(routeMap, '<TruckMap', 'trip renders embedded route map inside UrTruck');

console.log('\n[gps-consent] OK — canonical Start-trip disclosure + Android background-location contract');
