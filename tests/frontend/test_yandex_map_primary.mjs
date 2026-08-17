import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const trackSrc = fs.readFileSync('src/screens/TrackTruckScreen.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');

test('web deal map uses embedded Yandex Maps as the only provider', () => {
  assert.match(mapSrc, /globalThis\.ymaps/);
  assert.match(mapSrc, /new api\.Map/);
  assert.match(mapSrc, /new api\.Placemark/);
  assert.match(mapSrc, /testID="truck-map-yandex-web"/);
  assert.doesNotMatch(mapSrc, /Linking\.openURL|yandex\.ru\/maps/);
});

test('production injector loads supported Yandex JS API 2.1 in Russian', () => {
  assert.match(injectSrc, /api-maps\.yandex\.ru\/2\.1/);
  assert.match(injectSrc, /lang=ru_RU/);
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_MAPS_CONFIGURED__/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_MAPS_VERSION__=/);
  assert.doesNotMatch(injectSrc, /api-maps\.yandex\.ru\/v3/);
});

test('no alternate web map provider can execute', () => {
  assert.doesNotMatch(mapSrc, /LEAFLET_JS|LEAFLET_CSS|unpkg\.com\/leaflet|tile\.openstreetmap\.org|OpenStreetMapFallback|truck-map-osm-fallback|useFallback|\.tileLayer\(/);
  assert.match(mapSrc, /truck-map-yandex-error/);
  assert.match(mapSrc, /Карта не будет заменена другим провайдером/);
});

test('deal map exposes real Yandex route distance and travel time', () => {
  assert.match(mapSrc, /multiRoute\.getActiveRoute/);
  assert.match(mapSrc, /properties\?\.get\?\.\('distance'\)/);
  assert.match(mapSrc, /properties\?\.get\?\.\('duration'\)/);
  assert.match(mapSrc, /distanceText/);
  assert.match(mapSrc, /durationText/);
  assert.match(mapSrc, /onRouteSummary/);
});

test('live GPS route metrics are remaining distance to destination, not a fake estimate', () => {
  assert.match(mapSrc, /plannedPoints\[plannedPoints\.length - 1\]/);
  assert.match(mapSrc, /\[livePoint, destination\]/);
  assert.match(mapSrc, /requestfail', addStraightFallback/);
  assert.match(mapSrc, /emitSummary\(null\)/);
});

test('tracking screen renders distance and delivery time card over the map', () => {
  assert.match(trackSrc, /testID="track-route-metrics"/);
  assert.match(trackSrc, /t\('distance'\)/);
  assert.match(trackSrc, /t\('delivery_time'\)/);
  assert.match(trackSrc, /routeSummary\.distanceText/);
  assert.match(trackSrc, /routeSummary\.durationText/);
});
