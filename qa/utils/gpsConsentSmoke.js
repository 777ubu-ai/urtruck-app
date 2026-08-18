/* Active-trip GPS + Google Play background-location compliance contract. */
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
must(hook, 'marketAPI.activeTrackingDeals()', 'background task takes server-approved IDs');
must(hook, 'getForegroundPermissionsAsync()', 'foreground broadcaster only reads existing grant');
mustNot(hook, 'requestForegroundPermissionsAsync()', 'background hook does not request foreground permission');
mustNot(hook, 'requestBackgroundPermissionsAsync()', 'background hook does not request background permission');

// Every Android start-trip permission request is routed through the visible
// disclosure host before any system prompt.
must(tracker, "Platform.OS === 'android'", 'Android has an explicit permission branch');
must(tracker, 'requestLocationPermissionThroughDisclosure', 'Android requests permission through disclosure coordinator');
must(tracker, 'getBackgroundLocationPermissionState()', 'background service checks existing grants');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestForegroundLocationPermission()', 'background service cannot ask foreground permission');
mustNot(tracker.split('export async function startBackgroundTracking()')[1] || '', 'requestBackgroundLocationPermission()', 'background service cannot ask background permission');
must(coordinator, 'registerLocationPermissionRequestHandler', 'visible deal screen can register disclosure host');
must(coordinator, 'disclosure_host_unavailable', 'hidden/legacy screens fail closed without disclosure host');

// Google Play prominent disclosure wording must be unmistakable and appear
// before the OS permission flow.
must(disclosure, 'Геолокация во время рейса', 'prominent disclosure has clear feature title');
must(disclosure, 'в фоновом режиме', 'disclosure explicitly says background location');
must(disclosure, 'когда приложение закрыто или не используется', 'disclosure covers app closed/not in use');
must(disclosure, 'Передача прекращается после завершения или отмены рейса', 'disclosure explains when tracking stops');
must(disclosure, 'background-location-disclosure-continue', 'disclosure has explicit Continue action');
must(disclosure, 'background-location-open-settings', 'Android settings continuation is visible');

// Driver-only contextual control + ordered permission flow.
must(gate, "effectiveRole === 'driver'", 'permission control is driver-only');
must(gate, "dealStatus === 'accepted'", 'permission control appears before trip starts');
must(gate, 'deal-background-location-bar', 'accepted driver sees contextual location bar');
must(gate, 'deal-background-location-allow', 'accepted driver has explicit Allow action');
must(gate, 'requestForegroundLocationPermission()', 'foreground permission is requested first');
must(gate, 'requestBackgroundLocationPermission()', 'background permission follows foreground permission');
must(gate, 'openLocationSettings()', 'Android settings path exists for all-time access');
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

// Android manifest/config must actually declare the background feature shown to
// the Google reviewer.
const permissions = app.android?.permissions || [];
for (const required of [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
]) {
  if (!permissions.includes(required)) throw new Error(`GPS consent contract missing Android permission: ${required}`);
  console.log(`  ✓ manifest permission ${required}`);
}
const locationPlugin = (app.plugins || []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-location');
if (!locationPlugin?.[1]?.isAndroidBackgroundLocationEnabled) {
  throw new Error('GPS consent contract missing: expo-location Android background mode');
}
console.log('  ✓ expo-location Android background mode enabled');

must(routeMap, '<TruckMap', 'trip renders embedded route map inside UrTruck');

console.log('\n[gps-consent] OK — Google Play background-location disclosure contract');
