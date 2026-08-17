import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');

test('web deal map uses embedded Yandex Maps as the only provider', () => {
  assert.match(mapSrc, /globalThis\.ymaps3/);
  assert.match(mapSrc, /new api\.YMapFeature/);
  assert.match(mapSrc, /type: 'LineString'/);
  assert.match(mapSrc, /testID="truck-map-yandex-web"/);
  assert.doesNotMatch(mapSrc, /Linking\.openURL|yandex\.ru\/maps/);
});

test('production injector loads Yandex JS API v3 in Russian', () => {
  assert.match(injectSrc, /api-maps\.yandex\.ru\/v3/);
  assert.match(injectSrc, /lang=ru_RU/);
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_MAPS_CONFIGURED__/);
});

test('Leaflet and OpenStreetMap are completely removed from the web map', () => {
  assert.doesNotMatch(mapSrc, /Leaflet|leaflet|OpenStreetMap|openstreetmap|tileLayer|truck-map-osm-fallback|useFallback/);
  assert.match(mapSrc, /truck-map-yandex-error/);
  assert.match(mapSrc, /Карта не будет заменена другим провайдером/);
});
