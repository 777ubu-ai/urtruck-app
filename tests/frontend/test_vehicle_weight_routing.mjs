// test_vehicle_weight_routing — regression-guard for the P1 flagged on
// PR #239 (2026-08-19), fixed and re-flagged twice by independent review
// before the semantics were actually right:
//
//   Round 1 review: "реальный TruckMap.web.js всё ещё вызывает
//   routingAPI.roadRoute(effectivePoints) без объекта vehicle, хотя клиент
//   и backend поддерживают height/width/length/weight/axle_load/
//   has_trailer."
//
//   Round 2 review (after the vehicle object was threaded through, using
//   `{ weight_t: capacityTons }`): "По официальной Yandex Router API
//   семантике weight = фактическая масса автомобиля, а максимальная
//   грузоподъёмность имеет отдельный параметр payload... Подставлять эти
//   значения в weight нельзя: это может занижать/искажать весовые
//   ограничения маршрута."
//
//   Round 3 review (after weight_t/payload_t were split, but
//   capacityTons still fell back to deal.cargo_weight_tons when no trip
//   was linked): "Yandex payload = maximum vehicle load capacity, а не
//   фактическая масса текущего груза... cargo_weight_tons нельзя
//   подставлять в payload."
//
// Full height/width/length/axle_load data still does not exist anywhere in
// the schema (Graphify-gated registration-schema change, out of scope).
// What's threaded through now, correctly:
//
//   TripDetail.trip.capacityTons ──────────────┐
//                                               v
//   ChatScreen deal.trip_capacity_tons   ──> RouteMap/TrackTruckScreen
//   (NO cargo_weight_tons fallback —          builds {payload_t} ──> TruckMap
//   see round-3 test below)                                        .roadRoute(points, vehicle)
//                                                                   (backend maps payload_t -> Yandex
//                                                                    `payload` param, NEVER `weight`)
//
// It does not claim this closes full HGV dimension-awareness — only that
// the one number the app reliably knows (a trip's real payload capacity)
// now reaches the router under the correct parameter name, and nothing
// else masquerades as vehicle data.
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

test('ChatScreen threads only the trip\'s real payload capacity into TrackTruck navigation params — no cargo-weight fallback', () => {
  assert.match(chatScreen, /cargo_weight_tons: prev\?\.cargo_weight_tons \?\? srv\.cargo_weight_tons/);
  assert.match(chatScreen, /trip_capacity_tons: prev\?\.trip_capacity_tons \?\? srv\.trip_capacity_tons/);
  // 2nd independent re-review (2026-08-19): capacityTons used to fall back
  // to deal.cargo_weight_tons when no trip was linked yet. Yandex `payload`
  // means the vehicle's maximum load capacity, not the mass of one
  // specific cargo — cargo_weight_tons measures the latter, so it must
  // NOT feed vehicle.payload_t. Source is strictly trip_capacity_tons now;
  // no data beats wrong data here.
  assert.match(chatScreen, /capacityTons: deal\?\.trip_capacity_tons \?\? null,/);
  assert.doesNotMatch(chatScreen, /capacityTons:[^\n]*cargo_weight_tons/);
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
