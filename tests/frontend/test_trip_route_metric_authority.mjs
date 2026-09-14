import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tripDetail = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');

test('Trip detail never shows a second heuristic distance or ETA next to road-route metrics', () => {
  assert.match(tripDetail, /<RouteMap/);
  assert.doesNotMatch(tripDetail, /routeStats/);
  assert.doesNotMatch(tripDetail, /stats\.km|stats\.days/);
});

test('native route metrics are emitted only from returned road geometry', () => {
  assert.match(nativeMap, /if \(roadGeometry\.length >= 2 && remainingText\)/);
  assert.match(nativeMap, /provider: resolvedRoute\?\.provider \|\| 'server-road'/);
  assert.match(nativeMap, /onRouteSummary\?\.\(null\)/);
});
