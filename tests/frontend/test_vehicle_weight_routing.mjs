// test_vehicle_weight_routing — regression-guard for the P1 flagged by the
// owner's independent release review on PR #239 (2026-08-19), then
// re-flagged on re-review after the first fix attempt got the semantics
// wrong:
//
//   Round 1 review: "реальный TruckMap.web.js всё ещё вызывает
//   routingAPI.roadRoute(effectivePoints) без объекта vehicle, хотя клиент
//   и backend поддерживают height/width/length/weight/axle_load/
//   has_trailer."
//
//   Round 2 review (after the vehicle object was threaded through, using
//   `{ weight_t: capacityTons }`): "По официальной Yandex Router API
//   семантике weight = фактическая масса автомобиля, а максимальная
//   грузоподъёмность имеет отдельный параметр payload. trip_capacity_tons
//   — грузоподъёмность, а не фактическая масса тягача/автопоезда...
//   Подставлять эти значения в weight нельзя: это может занижать/
//   искажать весовые ограничения маршрута."
//
// Full height/width/length/axle_load data still does not exist anywhere in
// the schema — drivers_registration only has vehicle_type +
// vehicle_capacity_kg (adding the rest is a Graphify-gated
// registration-schema change needing explicit owner sign-off, out of
// scope here). What DOES already exist and is now threaded through
// CORRECTLY — as `payload_t`, never `weight_t` — is cargo weight_tons and
// trip capacity_tons:
//
//   TripDetail.trip.capacityTons ──────────────┐
//                                               v
//   ChatScreen deal.trip_capacity_tons/  ──> RouteMap/TrackTruckScreen
//   cargo_weight_tons (from backend            builds {payload_t} ──> TruckMap
//   get_deal() enrichment)                                          .roadRoute(points, vehicle)
//                                                                    (backend maps payload_t -> Yandex
//                                                                     `payload` param, NEVER `weight`)
//
// It does not claim this closes full HGV dimension-awareness — only that
// the weight the app already knows about now reaches the router under the
// correct parameter name, instead of masquerading as the vehicle's actual
// full mass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routeMap = fs.readFileSync('src/components/RouteMap.js', 'utf8');
const tripDetail = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const chatScreen = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');
const trackTruck = fs.readFileSync('src/screens/TrackTruckScreen.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const marketplace = fs.readFileSync('backend/api/marketplace.py', 'utf8');
const routingPy = fs.readFileSync('backend/api/routing.py', 'utf8');

test('RouteMap turns capacityTons into a partial VehicleSpec (payload_t, not weight_t) and passes it to TruckMap', () => {
  assert.match(routeMap, /capacityTons/);
  assert.match(routeMap, /const tons = Number\(capacityTons\)/);
  assert.match(routeMap, /Number\.isFinite\(tons\) && tons > 0 \? \{ payload_t: tons \} : null/);
  assert.match(routeMap, /<TruckMap[\s\S]{0,600}vehicle=\{vehicle\}/);
});

test('TripDetail feeds the already-collected trip capacity into RouteMap (no new data collection)', () => {
  assert.match(tripDetail, /<RouteMap[\s\S]{0,300}capacityTons=\{trip\.capacityTons\}/);
});

test('ChatScreen threads the deal\'s known weight into TrackTruck navigation params', () => {
  assert.match(chatScreen, /cargo_weight_tons: prev\?\.cargo_weight_tons \?\? srv\.cargo_weight_tons/);
  assert.match(chatScreen, /trip_capacity_tons: prev\?\.trip_capacity_tons \?\? srv\.trip_capacity_tons/);
  assert.match(chatScreen, /capacityTons: deal\?\.trip_capacity_tons \?\? deal\?\.cargo_weight_tons \?\? null/);
});

test('TrackTruckScreen builds a vehicle spec (payload_t, not weight_t) from the navigated capacityTons and passes it to TruckMap', () => {
  assert.match(trackTruck, /const \{ dealId, from, to, driverName, capacityTons \} = route\.params/);
  assert.match(trackTruck, /Number\.isFinite\(tons\) && tons > 0 \? \{ payload_t: tons \} : null/);
  assert.match(trackTruck, /<TruckMap[\s\S]{0,600}vehicle=\{vehicle\}/);
});

test('both TruckMap platforms accept a vehicle prop and forward it to the authenticated road-routing call', () => {
  assert.match(webMap, /routingAPI\.roadRoute\(effectivePoints, vehicle\)/);
  assert.match(nativeMap, /routingAPI\.roadRoute\(effectivePairs, vehicle\)/);
});

test('capacityTons never reaches vehicle.weight_t anywhere in the frontend (round-2 review regression guard)', () => {
  // The exact mistake flagged on re-review: subbing payload/capacity data
  // into the field that means the vehicle's actual full mass. Lock this out
  // so it can't quietly come back in a future edit.
  assert.doesNotMatch(routeMap, /\{ weight_t: tons \}/);
  assert.doesNotMatch(trackTruck, /\{ weight_t: tons \}/);
});

test('backend VehicleSpec has a distinct payload_t field, separate from weight_t', () => {
  assert.match(routingPy, /weight_t: Optional\[float\] = Field\(default=None, gt=0, le=100\)/);
  assert.match(routingPy, /payload_t: Optional\[float\] = Field\(default=None, gt=0, le=100\)/);
});

test('Yandex request maps payload_t to the `payload` param and weight_t to the `weight` param, never crossed', () => {
  assert.match(routingPy, /if vehicle\.weight_t is not None:\s*\n\s*params\["weight"\] = vehicle\.weight_t/);
  assert.match(routingPy, /if vehicle\.payload_t is not None:\s*\n\s*params\["payload"\] = vehicle\.payload_t/);
});

test('ORS restrictions.weight is derived only from weight_t, never from payload_t (round-2 review requirement)', () => {
  const orsFn = routingPy.slice(routingPy.indexOf('def _ors_options'), routingPy.indexOf('async def _request_ors'));
  assert.match(orsFn, /if vehicle\.weight_t is not None:\s*\n\s*restrictions\["weight"\] = vehicle\.weight_t/);
  assert.doesNotMatch(orsFn, /vehicle\.payload_t/);
});

test('backend get_deal() returns the cargo/trip weight data that already exists in the schema, not fabricated fields', () => {
  assert.match(marketplace, /SELECT cargo_desc, currency, from_country, to_country, weight_tons FROM cargos WHERE id = \?/);
  assert.match(marketplace, /d\.setdefault\("cargo_weight_tons", cr\["weight_tons"\]\)/);
  assert.match(marketplace, /SELECT driver_id, from_country, to_country, capacity_tons FROM trips WHERE id = \?/);
  assert.match(marketplace, /d\.setdefault\("trip_capacity_tons", tr\["capacity_tons"\]\)/);
});
