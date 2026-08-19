// test_vehicle_weight_routing — regression-guard for the P1 flagged by the
// owner's independent release review on PR #239 (2026-08-19):
//
//   "реальный TruckMap.web.js всё ещё вызывает routingAPI.roadRoute
//   (effectivePoints) без объекта vehicle, хотя клиент и backend
//   поддерживают height/width/length/weight/axle_load/has_trailer. Значит
//   фактический web HGV-route не доказан как учитывающий реальные
//   габариты/вес конкретной машины."
//
// Full height/width/length/axle_load data does not exist anywhere in the
// schema — drivers_registration only has vehicle_type + vehicle_capacity_kg
// (adding the rest is a Graphify-gated registration-schema change that
// needs explicit owner sign-off, out of scope here). What DOES already
// exist and was simply never threaded through: cargo weight_tons and trip
// capacity_tons, both already collected at publish time and already
// displayed on TripDetail. This test proves that value now reaches
// routingAPI.roadRoute()'s `vehicle` argument end-to-end:
//
//   TripDetail.trip.capacityTons ──────────────┐
//                                               v
//   ChatScreen deal.trip_capacity_tons/  ──> RouteMap/TrackTruckScreen
//   cargo_weight_tons (from backend            builds {weight_t} ──> TruckMap
//   get_deal() enrichment)                                          .roadRoute(points, vehicle)
//
// It does not claim this closes full HGV dimension-awareness — only that
// the weight the app already knows about is no longer silently dropped.
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

test('RouteMap turns capacityTons into a partial VehicleSpec and passes it to TruckMap', () => {
  assert.match(routeMap, /capacityTons/);
  assert.match(routeMap, /const tons = Number\(capacityTons\)/);
  assert.match(routeMap, /Number\.isFinite\(tons\) && tons > 0 \? \{ weight_t: tons \} : null/);
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

test('TrackTruckScreen builds a vehicle spec from the navigated capacityTons and passes it to TruckMap', () => {
  assert.match(trackTruck, /const \{ dealId, from, to, driverName, capacityTons \} = route\.params/);
  assert.match(trackTruck, /Number\.isFinite\(tons\) && tons > 0 \? \{ weight_t: tons \} : null/);
  assert.match(trackTruck, /<TruckMap[\s\S]{0,600}vehicle=\{vehicle\}/);
});

test('both TruckMap platforms accept a vehicle prop and forward it to the authenticated road-routing call', () => {
  assert.match(webMap, /routingAPI\.roadRoute\(effectivePoints, vehicle\)/);
  assert.match(nativeMap, /routingAPI\.roadRoute\(effectivePairs, vehicle\)/);
});

test('backend get_deal() returns the cargo/trip weight data that already exists in the schema, not fabricated fields', () => {
  assert.match(marketplace, /SELECT cargo_desc, currency, from_country, to_country, weight_tons FROM cargos WHERE id = \?/);
  assert.match(marketplace, /d\.setdefault\("cargo_weight_tons", cr\["weight_tons"\]\)/);
  assert.match(marketplace, /SELECT driver_id, from_country, to_country, capacity_tons FROM trips WHERE id = \?/);
  assert.match(marketplace, /d\.setdefault\("trip_capacity_tons", tr\["capacity_tons"\]\)/);
});
