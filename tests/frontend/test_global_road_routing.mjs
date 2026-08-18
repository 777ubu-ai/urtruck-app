import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const client = fs.readFileSync('src/utils/routingAPI.js', 'utf8');
const backend = fs.readFileSync('backend/api/routing.py', 'utf8');
const deploy = fs.readFileSync('.github/workflows/secure-production-deploy.yml', 'utf8');

test('China/international corridors request authenticated real-road geometry instead of trusting a straight line', () => {
  assert.match(webMap, /needsGlobalRoadRouting/);
  assert.match(webMap, /routingAPI\.roadRoute\(effectivePoints\)/);
  assert.match(webMap, /truck-map-global-routing-loading/);
  assert.match(webMap, /Маршрут по дороге временно недоступен/);
  assert.match(nativeMap, /routingAPI\.roadRoute\(effectivePairs\)/);
});

test('global road geometry is rendered as a solid route on top of the Yandex web map', () => {
  assert.match(webMap, /new api\.Polyline\(externalGeometry/);
  assert.match(webMap, /strokeStyle: 'solid'/);
  assert.match(webMap, /distanceTextFromMeters/);
  assert.match(webMap, /durationTextFromSeconds/);
  assert.match(webMap, /provider: externalRoute\?\.provider \|\| 'global'/);
});

test('routing provider key remains server-only and endpoint is authenticated', () => {
  assert.match(client, /\$\{API_BASE\}\/routing\/road-route/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(client, /OPENROUTESERVICE_API_KEY|ORS_API_KEY/);
  assert.match(backend, /Depends\(get_user\)/);
  assert.match(backend, /OPENROUTESERVICE_API_KEY/);
  assert.match(backend, /driving-hgv\/geojson/);
});

test('global HGV provider uses metres and seconds so map metrics are not fabricated', () => {
  assert.match(backend, /distance_m = float\(summary\.get\("distance"\)\)/);
  assert.match(backend, /duration_s = float\(summary\.get\("duration"\)\)/);
  assert.doesNotMatch(backend, /"units": "km"/);
  assert.match(backend, /"vehicle_type": "hgv"/);
});

test('production deploy preserves global routing secret and fails closed when missing', () => {
  assert.match(deploy, /OPENROUTESERVICE_API_KEY: \$\{\{ secrets\.OPENROUTESERVICE_API_KEY \}\}/);
  assert.match(deploy, /GLOBAL_ROUTING_KEY=ready/);
  assert.match(deploy, /GLOBAL_ROUTING_ENDPOINT=guarded/);
});
