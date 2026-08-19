/* Active-trip GPS + Android foreground-location-service compliance contract. */
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const api = read('backend/api/marketplace.py');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const tracker = read('src/utils/backgroundLocation.js');
const coordinator = read('src/utils/locationPermissionCoordinator.js');
const gate = read('src/components/deal/DealLocationPermissionGate.js');
const disclosure = read('src/components/deal/BackgroundLocationDisclosureModal.js');
const chatV2 = read('src/screens/ChatScreenV2.js');
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
// per-trip disclosure; Android then requests foreground location only.
must(tracker, "Platform.OS === 'android' || Platform.OS === 'web'", 'Android and web route Start trip through the disclosure coordinator');
must(tracker, "requestLocationPermissionThroughDisclosure({ source: 'start_trip' })", 'Start trip requests permission through disclosure coordinator');
must(tracker, 'getBackgroundLocationPermissionState()', 'location service checks existing grants');
must(tracker, "background: 'not_required_foreground_service'", 'Android permission state marks background permission unnecessary');
must(tracker, 'foregroundService:', 'active-trip updates use a location foreground service');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestForegroundLocationPermission()', 'location service cannot ask foreground permission');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestBackgroundLocationPermission()', 'location service cannot ask background permission');
must(coordinator, 'registerLocationPermissionRequestHandler', 'visible deal screen can register disclosure host');
must(coordinator, 'disclosure_host_unavailable', 'hidden/legacy screens fail closed without disclosure host');

// Prominent disclosure matches the approved "Track trip" visual and explains
// minimized/screen-off active-trip tracking plus the exact stop condition.
must(disclosure, 'Отслеживать рейс', 'prominent disclosure uses the approved feature title');
must(disclosure, 'Во время активного рейса UrTruck передаёт местоположение автомобиля грузоотправителю', 'disclosure explains why location is shared');
must(disclosure, 'приложение свёрнуто или экран выключен', 'disclosure explains minimized and screen-off behavior');
must(disclosure, 'системный сервис активного рейса', 'disclosure explains active-trip system service');
must(disclosure, 'Передача прекращается после завершения или отмены рейса', 'disclosure explains when tracking stops');
must(disclosure, 'Разрешить и начать рейс', 'primary disclosure action matches the user intent');
must(disclosure, 'Не сейчас', 'secondary disclosure action is explicit');
mustNot(disclosure, 'когда приложение закрыто или не используется', 'disclosure does not claim closed-app background access');
must(disclosure, 'Доступ «Разрешить всегда» не требуется', 'settings recovery keeps all-time location out of scope');
must(disclosure, 'background-location-disclosure-continue', 'disclosure has explicit start-trip consent action');
must(disclosure, 'background-location-open-settings', 'foreground permission recovery path is visible');

// No proactive permission card exists. The same visible modal is available to
// driver Start-trip actions on Android and web, including production web QA.
must(gate, "effectiveRole === 'driver'", 'disclosure host is driver-only');
must(gate, "Platform.OS === 'android' || Platform.OS === 'web'", 'disclosure host supports Android and web');
must(gate, 'Per-trip consent is intentional', 'approved modal is shown for every new trip start');
must(gate, 'registerLocationPermissionRequestHandler(beginDisclosure)', 'driver deal screen registers Start-trip disclosure handler');
must(gate, 'requestForegroundLocationPermission()', 'foreground permission is requested after disclosure');
mustNot(gate, 'requestBackgroundLocationPermission', 'Android deal gate never requests background permission');
mustNot(gate, 'deal-background-location-bar', 'accepted deal has no proactive location permission bar');
mustNot(gate, 'deal-background-location-allow', 'accepted deal has no separate Allow button');
mustNot(gate, "dealStatus === 'accepted'", 'permission UI is not driven by a pre-trip status banner');
must(gate, 'openLocationSettings()', 'settings path exists only to restore foreground location access');
must(gate, "setModalMode('disclosure')", 'permission flow begins with in-app disclosure');

// The real deal route must mount the host and Start trip must block the FSM
// transition until permission returns ok.
must(chatV2, '<DealLocationPermissionGate', 'deal workspace is wrapped by disclosure host');
must(workspace, 'ensureBackgroundLocationPermission()', 'start trip checks location permission');
const permissionIndex = workspace.indexOf('ensureBackgroundLocationPermission()');
const statusIndex = workspace.indexOf("changeDealStatus('in_progress')");
if (permissionIndex < 0 || statusIndex < 0 || permissionIndex > statusIndex) {
  throw new Error('GPS consent contract violation: deal becomes in_progress before permission succeeds');
}
console.log('  ✓ start trip waits for permission before FSM transition');

// Android declares only the minimum location scope used by the active-trip
// foreground service. iOS background location remains configured separately.
const permissions = app.android?.permissions || [];
for (const required of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
]) {
  if (!permissions.includes(required)) throw new Error(`GPS consent contract missing Android permission: ${required}`);
  console.log(`  ✓ Android permission ${required}`);
}
if (permissions.includes('android.permission.ACCESS_BACKGROUND_LOCATION')) {
  throw new Error('GPS consent contract violation: Android ACCESS_BACKGROUND_LOCATION must not be declared');
}
console.log('  ✓ Android ACCESS_BACKGROUND_LOCATION is not declared');
mustNot(manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION', 'native manifest omits Android background location permission');
must(manifest, 'android.permission.FOREGROUND_SERVICE_LOCATION', 'native manifest keeps location foreground-service permission');

const locationPlugin = (app.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
if (locationPlugin?.[1]?.isAndroidForegroundServiceEnabled !== true) {
  throw new Error('GPS consent contract missing: expo-location Android foreground service mode');
}
if (locationPlugin?.[1]?.isAndroidBackgroundLocationEnabled !== false) {
  throw new Error('GPS consent contract violation: expo-location Android background mode must be disabled');
}
if (locationPlugin?.[1]?.isIosBackgroundLocationEnabled !== true) {
  throw new Error('GPS consent contract missing: iOS background location mode');
}
console.log('  ✓ expo-location Android foreground service mode enabled, background mode disabled');

must(routeMap, '<TruckMap', 'trip renders embedded route map inside UrTruck');

console.log('\n[gps-consent] OK — Start-trip disclosure + Android foreground-location contract');
