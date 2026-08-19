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

// Every Android start-trip permission request is routed through the visible
// disclosure host before the only runtime grant we need: foreground location.
must(tracker, "Platform.OS === 'android'", 'Android has an explicit permission branch');
must(tracker, 'requestLocationPermissionThroughDisclosure', 'Android requests permission through disclosure coordinator');
must(tracker, 'getBackgroundLocationPermissionState()', 'location service checks existing grants');
must(tracker, "background: 'not_required_foreground_service'", 'Android permission state marks background permission unnecessary');
must(tracker, 'foregroundService:', 'active-trip updates use a location foreground service');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestForegroundLocationPermission()', 'location service cannot ask foreground permission');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestBackgroundLocationPermission()', 'location service cannot ask background permission');
must(coordinator, 'registerLocationPermissionRequestHandler', 'visible deal screen can register disclosure host');
must(coordinator, 'disclosure_host_unavailable', 'hidden/legacy screens fail closed without disclosure host');

// Prominent disclosure explains the user-visible foreground-service behavior
// and the active-trip lifetime without claiming all-time/background access.
must(disclosure, 'Геолокация во время рейса', 'prominent disclosure has clear feature title');
must(disclosure, 'системный сервис с постоянным уведомлением', 'disclosure explains persistent Android service notification');
must(disclosure, 'Передача геолокации прекращается после завершения или отмены рейса', 'disclosure explains when tracking stops');
mustNot(disclosure, 'когда приложение закрыто или не используется', 'disclosure does not claim closed-app background access');
must(disclosure, 'не просит доступ «Разрешить всегда»', 'disclosure states all-time location is not requested');
must(disclosure, 'background-location-disclosure-continue', 'disclosure has explicit Allow action');
must(disclosure, 'background-location-open-settings', 'location settings continuation is visible');

// Driver-only contextual control + ordered permission flow.
must(gate, "effectiveRole === 'driver'", 'permission control is driver-only');
must(gate, "dealStatus === 'accepted'", 'permission control appears before trip starts');
must(gate, 'deal-background-location-bar', 'accepted driver sees contextual location bar');
must(gate, 'deal-background-location-allow', 'accepted driver has explicit Allow action');
must(gate, 'requestForegroundLocationPermission()', 'foreground permission is requested after disclosure');
mustNot(gate, 'requestBackgroundLocationPermission', 'Android deal gate never requests background permission');
must(gate, 'openLocationSettings()', 'settings path exists if foreground permission must be restored');
must(gate, "setModalMode('disclosure')", 'flow begins with in-app disclosure');

// The real deal route must mount the host and start-trip must still block the
// FSM transition until permission returns ok.
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

console.log('\n[gps-consent] OK — active-trip minimum-scope location contract');