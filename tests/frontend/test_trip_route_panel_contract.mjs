import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync('src/components/TripRoutePanel.js', 'utf8');
const trip = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('ordinary trip details use compact tools and real authenticated routing', () => {
  assert.match(trip, /import TripRoutePanel/);
  assert.match(trip, /<TripRoutePanel/);
  assert.doesNotMatch(trip, /import RouteMap/);
  assert.match(panel, /routingAPI\.roadRoute\(routePoints, vehicle/);
  assert.match(panel, /result\?\.distance_m/);
  assert.match(panel, /result\?\.duration_s/);
  assert.doesNotMatch(panel, /TruckMap|<Modal|routeStats|haversine/i);
});

test('trip tools expose rates, weather, Border and deal GPS without fake values', () => {
  for (const id of ['rates', 'weather', 'border', 'gps']) {
    assert.match(panel, new RegExp(`trip-tool-\\$\\{item\\.key\\}`));
  }
  assert.match(panel, /gpsPending/);
  assert.match(trip, /\['in_progress', 'at_border'\]\.includes\(dealStatus\)/);
  assert.doesNotMatch(panel, /406|8 ч|62 км|54 мин/);
});

test('deal workspace keeps the embedded map and active tracking path', () => {
  assert.match(workspace, /<TruckMap/);
  assert.match(workspace, /testID="deal-header-map"/);
  assert.match(workspace, /params\.action === 'tracking'/);
  assert.match(workspace, /\['in_progress', 'at_border'\]/);
});

test('route failure leaves native map visible and interactive behind a compact banner', () => {
  const overlay = nativeMap.match(/mapOverlay:\s*\{([^}]+)\}/)?.[1] || '';
  assert.doesNotMatch(overlay, /StyleSheet\.absoluteFillObject/);
  assert.match(overlay, /position:\s*'absolute'/);
  assert.match(overlay, /bottom:\s*14/);
  assert.match(nativeMap, /testID="truck-map-route-retry"/);
});
