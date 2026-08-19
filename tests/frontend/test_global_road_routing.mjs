import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const client = fs.readFileSync('src/utils/routingAPI.js', 'utf8');
const backend = fs.readFileSync('backend/api/routing.py', 'utf8');
const deploy = fs.readFileSync('.github/workflows/secure-production-deploy.yml', 'utf8');

test('every deal route requests authenticated server road geometry, including Almaty-Moscow', () => {
  // 2026-08-19 (P1, независимый release review): roadRoute() теперь также
  // получает vehicle (partial VehicleSpec из уже собранной грузоподъёмности
  // рейса/груза) — второй аргумент, а не пустой вызов.
  assert.match(webMap, /routingAPI\.roadRoute\(effectivePoints, vehicle\)/);
  assert.match(nativeMap, /routingAPI\.roadRoute\(effectivePairs, vehicle\)/);
  assert.match(webMap, /truck-map-road-routing-loading/);
  assert.match(webMap, /Маршрут по дороге временно недоступен/);
});

test('TruckMap accepts a vehicle spec and threads it into the server routing request on both platforms', () => {
  assert.match(webMap, /vehicle = null,/);
  assert.match(nativeMap, /vehicle = null,/);
  assert.match(webMap, /vehicleKey = vehicle \? JSON\.stringify\(vehicle\) : ''/);
  assert.match(nativeMap, /vehicleKey = vehicle \? JSON\.stringify\(vehicle\) : ''/);
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

test('production deploy treats server Yandex Router as optional and never blocks on it', () => {
  // 2026-08-19: this used to require a hard-fail preflight
  // ("Preflight Yandex Router before touching production") that exited 1
  // (and skipped the whole deploy, including the plain web MultiRoute
  // fallback and unrelated backend fixes) whenever YANDEX_ROUTER_API_KEY
  // was missing/rejected. Fixed to a soft preflight that warns and
  // continues — the paid server router is a quality upgrade, not a
  // release gate; the free client-side Yandex MultiRoute fallback (see
  // 'straight direction fallback cannot masquerade as the real road
  // route' above) must still ship.
  assert.match(deploy, /YANDEX_ROUTER_API_KEY: \$\{\{ secrets\.YANDEX_ROUTER_API_KEY \}\}/);
  assert.match(deploy, /Preflight optional server-side Yandex Router/);
  assert.match(deploy, /SELECTED_YANDEX_ROUTER_API_KEY/);
  assert.match(deploy, /YANDEX_ROUTER_API_KEY is not configured; web\/PWA will use embedded Yandex JS API 2\.1 MultiRoute\. Production deploy continues\./);
  assert.doesNotMatch(deploy, /Preflight Yandex Router before touching production/);
  assert.match(deploy, /ROAD_ROUTING_ENDPOINT=guarded/);
});
