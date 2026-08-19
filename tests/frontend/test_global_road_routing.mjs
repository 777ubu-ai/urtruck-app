import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const client = fs.readFileSync('src/utils/routingAPI.js', 'utf8');
const backend = fs.readFileSync('backend/api/routing.py', 'utf8');
const deploy = fs.readFileSync('.github/workflows/secure-production-deploy.yml', 'utf8');

test('every deal route requests authenticated server road geometry, including Almaty-Moscow', () => {
  assert.match(webMap, /routingAPI\.roadRoute\(effectivePoints\)/);
  assert.match(nativeMap, /routingAPI\.roadRoute\(effectivePairs\)/);
  assert.match(webMap, /truck-map-road-routing-loading/);
  assert.match(webMap, /Маршрут по дороге временно недоступен/);
});

test('trusted server geometry is a solid green road on the Yandex web map', () => {
  assert.match(webMap, /new api\.Polyline\(geometry/);
  assert.match(webMap, /strokeStyle: 'solid'/);
  assert.match(webMap, /distanceTextFromMeters/);
  assert.match(webMap, /durationTextFromSeconds/);
  assert.match(webMap, /provider: serverRoute\?\.provider \|\| 'server-road'/);
});

test('straight direction fallback cannot masquerade as the real road route', () => {
  assert.match(webMap, /strokeColor: '#6B7B73'/);
  assert.match(webMap, /strokeStyle: 'dash'/);
  assert.match(webMap, /truck-map-road-route-unavailable/);
  assert.doesNotMatch(webMap, /strokeColor: '#168759'[\s\S]{0,120}strokeStyle: 'dash'/);
});

test('KZ-RU server routing is Yandex Router API in truck mode with real polyline metrics', () => {
  assert.match(backend, /api\.routing\.yandex\.net\/v2\/route/);
  assert.match(backend, /"mode": mode/);
  assert.match(backend, /for mode in \("truck", "driving"\)/);
  assert.match(backend, /step\.get\("length"\)/);
  assert.match(backend, /step\.get\("duration"\)/);
  assert.match(backend, /step\.get\("polyline"\)/);
  assert.match(backend, /YANDEX_ROUTER_API_KEY/);
});

test('China remains hybrid and provider keys never reach browser/mobile client', () => {
  assert.match(backend, /_looks_like_china_corridor/);
  assert.match(backend, /api\.heigit\.org\/openrouteservice/);
  assert.match(client, /\$\{API_BASE\}\/routing\/road-route/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(client, /YANDEX_ROUTER_API_KEY|OPENROUTESERVICE_API_KEY|ORS_API_KEY/);
  assert.match(backend, /Depends\(get_user\)/);
});

test('production deploy validates optional server Router without blocking embedded Yandex JS road routing', () => {
  assert.match(deploy, /YANDEX_ROUTER_API_KEY: \$\{\{ secrets\.YANDEX_ROUTER_API_KEY \}\}/);
  assert.match(deploy, /Preflight optional server-side Yandex Router/);
  assert.match(deploy, /python3 scripts\/yandex_router_smoke\.py/);
  assert.match(deploy, /SELECTED_YANDEX_ROUTER_API_KEY/);
  assert.match(deploy, /web\/PWA will use embedded Yandex JS API 2\.1 MultiRoute/);
  assert.match(deploy, /ROAD_ROUTING_ENDPOINT=guarded/);
});
