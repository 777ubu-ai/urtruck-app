import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const trips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');
const routeLine = readFileSync('src/components/ui/v1/RouteLine.js', 'utf8');
const cargoDetail = readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const tripDetail = readFileSync('src/screens/TripDetailV2.js', 'utf8');
const push = readFileSync('src/utils/push.js', 'utf8');
const nativeMap = readFileSync('src/components/TruckMap.native.js', 'utf8');

test('iOS chat does not force-scroll from every keyboard layout pass', () => {
  assert.doesNotMatch(chat, /onLayout=\{\(\) => \{[\s\S]{0,240}scheduleAutoScrollRef/);
  assert.match(chat, /New messages remain anchored by the content-size handler/);
});

test('my trips releases both loaders for the latest request and ignores stale responses', () => {
  assert.match(trips, /const loadRequestRef = useRef\(0\)/);
  assert.match(trips, /requestId === loadRequestRef\.current/);
  assert.match(trips, /setLoading\(false\);\s*setRefreshingList\(false\);/);
  assert.match(trips, /dashboard_timeout/);
});

test('root deal header has no notification bell entry point', () => {
  assert.doesNotMatch(deals, /BellBadge/);
  assert.doesNotMatch(deals, /deals-notification-inbox/);
});

test('detail loading states always provide an explicit back button', () => {
  assert.match(cargoDetail, /testID="cargo-detail-loading-back"/);
  assert.match(tripDetail, /testID="trip-detail-loading-back"/);
});

test('approved compact route layout survives border-pair rendering', () => {
  assert.match(routeLine, /splitBorderPair/);
  assert.match(routeLine, /<View style=\{s\.row\}/);
  assert.match(routeLine, /чугучак.*tacheng.*塔城/);
  assert.match(routeLine, /бахты.*bakhty.*巴克图/);
  assert.match(routeLine, /crossingDestination: \{ flex: 1/);
  assert.match(routeLine, /numberOfLines=\{1\}/);
});


test('Android uses the platform default notification sound without looking for a fake default file', () => {
  assert.match(push, /setNotificationChannelAsync\(NATIVE_PUSH_CHANNEL_ID/);
  assert.doesNotMatch(push, /sound:\s*['\"]default['\"]/);
});

test('native MapKit receives its configured key before a YaMap view can mount', () => {
  assert.match(nativeMap, /YaMap\.init\(YANDEX_MAPKIT_API_KEY\)/);
  assert.match(nativeMap, /mapKitInitState === 'ready'/);
  assert.match(nativeMap, /testID="truck-map-native-initializing"/);
});
