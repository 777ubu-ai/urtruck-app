import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('native map uses Yandex MapKit with a separate native key', () => {
  const map = read('src/components/TruckMap.native.js');
  const app = read('App.js');
  const pkg = read('package.json');

  assert.match(pkg, /"react-native-yamap": "4\.8\.3"/);
  assert.match(map, /from 'react-native-yamap'/);
  assert.match(map, /EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY/);
  assert.match(map, /<YaMap/);
  assert.match(map, /<Polyline/);
  assert.match(map, /<Marker/);
  assert.doesNotMatch(map, /react-native-webview|WebView|api-maps\.yandex\.ru/);
  assert.match(app, /EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY/);
  assert.match(app, /YaMap\.init\(mapKitKey\)/);
  assert.doesNotMatch(app, /YANDEX_MAPS_JS_API_KEY/);
});

test('native map keeps the MapKit instance stable and updates route data independently', () => {
  const map = read('src/components/TruckMap.native.js');

  assert.match(map, /routingAPI\.roadRoute\(planned\.map\(toPair\), vehicle, \{ signal: controller.signal \}\)/);
  assert.match(map, /const effectiveKey = routeKey\(planned\)/);
  assert.doesNotMatch(map, /routingAPI\.roadRoute\(\[live/);
  assert.match(map, /testID="truck-map-yandex-mapkit"/);
  assert.match(map, /showUserPosition=\{false\}/);
  assert.match(map, /logoPosition=\{\{ horizontal: 'right', vertical: 'bottom' \}\}/);
});

test('native map has explicit no-coordinate and no-provider states', () => {
  const map = read('src/components/TruckMap.native.js');

  assert.match(map, /testID="truck-map-native-unavailable-no_route_coordinates"/);
  assert.match(map, /testID="truck-map-native-unavailable-provider_not_configured"/);
  assert.match(map, /t\('map_no_route_coordinates'\)/);
  assert.match(map, /t\('map_unavailable'\)/);
  assert.match(map, /__DEV__/);
});
