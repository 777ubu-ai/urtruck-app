import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panel = fs.readFileSync('src/components/TripRoutePanel.js', 'utf8');
const trip = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const rates = fs.readFileSync('src/utils/exchangeRates.js', 'utf8');
const wallet = fs.readFileSync('src/screens/WalletScreen.js', 'utf8');

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

test('weather and exchange rates are live-or-honest, never invented', () => {
  assert.match(panel, /getForegroundPermissionsAsync/);
  assert.doesNotMatch(panel, /requestForegroundPermissionsAsync/);
  assert.match(panel, /api\.open-meteo\.com/);
  assert.match(panel, /temperature_2m,apparent_temperature,weather_code/);
  assert.match(panel, /role !== 'driver'/);
  assert.match(rates, /open\.er-api\.com\/v6\/latest\/USD/);
  assert.match(rates, /source: 'unavailable'/);
  assert.doesNotMatch(rates, /FALLBACK|KZT:\s*470|CNY:\s*7\.25|RUB:\s*92/);
  assert.match(wallet, /fx_rates_unavailable/);
  assert.match(wallet, /fx\?\.stale/);
  assert.match(panel, /available: Boolean\(liveWeather\?\.text \|\| serverWeatherText\)/);
  assert.match(panel, /!item\.onPress && !item\.available && s\.menuDisabled/);
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
