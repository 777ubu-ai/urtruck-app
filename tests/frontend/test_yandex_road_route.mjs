import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const geoSrc = fs.readFileSync('src/utils/geo.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');
const routerSrc = fs.readFileSync('backend/api/routing.py', 'utf8');
const routingClient = fs.readFileSync('src/utils/routingAPI.js', 'utf8');

test('Yandex web map renders trusted server road geometry and keeps JS MultiRoute as compatibility fallback', () => {
  assert.match(mapSrc, /routingAPI\.roadRoute\(effectivePoints\)/);
  assert.match(mapSrc, /new api\.Polyline\(geometry/);
  assert.match(mapSrc, /strokeStyle: 'solid'/);
  assert.match(mapSrc, /api\.multiRouter\.MultiRoute/);
  assert.match(mapSrc, /routeActiveStrokeColor: '#168759'/);
});

test('server Yandex Router API builds truck routes for KZ-RU and real driving fallback when city centre is truck-restricted', () => {
  assert.match(routerSrc, /api\.routing\.yandex\.net\/v2\/route/);
  assert.match(routerSrc, /for mode in \("truck", "driving"\)/);
  assert.match(routerSrc, /"traffic": "disabled"/);
  assert.match(routerSrc, /"waypoints": "\|"\.join/);
  assert.match(routerSrc, /_parse_yandex_route/);
});

test('Bakhty-Tacheng checkpoint remains normalized as one border corridor', () => {
  assert.match(geoSrc, /'Бахты': \[46\.679365, 82\.776816\]/);
  assert.match(geoSrc, /'Чугучак': \[46\.739131, 82\.983797\]/);
  assert.match(geoSrc, /isBakhtyTachengBorderPair/);
  assert.match(geoSrc, /return \[CITIES\['Бахты'\]\]/);
});

test('map JS key and Router API key are separated; Router key stays server-side', () => {
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(injectSrc, /api-maps\.yandex\.ru\/2\.1/);
  assert.doesNotMatch(injectSrc, /EXPO_PUBLIC_YANDEX_ROUTER_API_KEY|__URTRUCK_YANDEX_ROUTER_API_KEY__/);
  assert.doesNotMatch(routingClient, /YANDEX_ROUTER_API_KEY/);
  assert.match(routerSrc, /os\.getenv\("YANDEX_ROUTER_API_KEY"\)/);
});
