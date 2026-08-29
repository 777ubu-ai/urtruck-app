import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const routeMapSrc = fs.readFileSync('src/components/RouteMap.js', 'utf8');
const trackSrc = fs.readFileSync('src/screens/TrackTruckScreen.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');
const routerSrc = fs.readFileSync('backend/api/routing.py', 'utf8');
const finalizerSrc = fs.readFileSync('.github/workflows/yandex-map-finalizer.yml', 'utf8');
const i18nSrc = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('web deal map uses embedded Yandex Maps as the visual provider', () => {
  assert.match(mapSrc, /globalThis\.ymaps/);
  assert.match(mapSrc, /new api\.Map/);
  assert.match(mapSrc, /new api\.Placemark/);
  assert.match(mapSrc, /testID="truck-map-yandex-web"/);
  assert.match(mapSrc, /suppressMapOpenBlock: true/);
  assert.doesNotMatch(mapSrc, /testID="truck-map-route-action"/);
  assert.doesNotMatch(mapSrc, /buildYandexRouteUrl/);
  assert.doesNotMatch(mapSrc, /Linking\.openURL/);
  assert.doesNotMatch(mapSrc, /Открыть в Яндекс Картах|yandex_maps_open/);

  // Route expansion is owned by UrTruck, not by the provider surface.
  assert.match(routeMapSrc, /testID="route-map-bottom-action"/);
  assert.match(routeMapSrc, /testID="route-map-fullscreen"/);
  assert.match(routeMapSrc, /setRouteOpen\(true\)/);
  assert.doesNotMatch(routeMapSrc, /Linking\.openURL/);
});

test('production injector loads supported Yandex JS API 2.1 in Russian', () => {
  assert.match(injectSrc, /api-maps\.yandex\.ru\/2\.1/);
  assert.match(injectSrc, /lang=ru_RU/);
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_MAPS_CONFIGURED__/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_MAPS_VERSION__=/);
  assert.doesNotMatch(injectSrc, /api-maps\.yandex\.ru\/v3/);
});

test('finalizer is verification-only, requires successful deploy, and cannot re-inject v3', () => {
  assert.match(finalizerSrc, /workflow_run\.conclusion == 'success'/);
  assert.match(finalizerSrc, /verification-only/);
  assert.match(finalizerSrc, /api-maps\.yandex\.ru\/2\.1/);
  assert.doesNotMatch(finalizerSrc, /src="https:\/\/api-maps\.yandex\.ru\/v3/);
  assert.doesNotMatch(finalizerSrc, /index\.write_text/);
});

test('no alternate web map renderer can execute', () => {
  assert.doesNotMatch(mapSrc, /LEAFLET_JS|LEAFLET_CSS|unpkg\.com\/leaflet|tile\.openstreetmap\.org|OpenStreetMapFallback|truck-map-osm-fallback|useFallback|\.tileLayer\(/);
  assert.match(mapSrc, /function StaticRouteFallback/);
  assert.match(mapSrc, /testID="truck-map-static-fallback"/);
  assert.doesNotMatch(mapSrc, /testID="truck-map-yandex-not-configured"/);
  // 2026-08-27: when Yandex JS is unavailable, UrTruck keeps the route visible
  // as its own static fallback instead of swapping providers.
  assert.match(mapSrc, /t\('map_not_configured_hint'\)/);
  assert.match(i18nSrc, /map_not_configured_hint: 'Карта не будет заменена другим провайдером\.'/);
});

test('KZ/RU route geometry and metrics come from Yandex Router API first', () => {
  assert.match(routerSrc, /api\.routing\.yandex\.net\/v2\/route/);
  assert.match(routerSrc, /for mode in \("truck", "driving"\)/);
  assert.match(routerSrc, /step\.get\("length"\)/);
  assert.match(routerSrc, /step\.get\("duration"\)/);
  assert.match(routerSrc, /step\.get\("polyline"\)/);
  assert.match(mapSrc, /distanceTextFromMeters/);
  assert.match(mapSrc, /durationTextFromSeconds/);
});

test('live GPS route metrics use current point to destination', () => {
  assert.match(mapSrc, /plannedPoints\[plannedPoints\.length - 1\]/);
  assert.match(mapSrc, /livePoint && destination \? \[livePoint, destination\] : plannedPoints/);
  assert.match(mapSrc, /routingAPI\.roadRoute\(effectivePoints, vehicle\)/);
  assert.match(mapSrc, /truck-map-road-route-unavailable/);
});

test('tracking screen renders distance and delivery time card over the map', () => {
  assert.match(trackSrc, /testID="track-route-metrics"/);
  assert.match(trackSrc, /t\('distance'\)/);
  assert.match(trackSrc, /t\('delivery_time'\)/);
  assert.match(trackSrc, /routeSummary\.distanceText/);
  assert.match(trackSrc, /routeSummary\.durationText/);
});
