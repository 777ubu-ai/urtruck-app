import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const grid = readFileSync('src/components/TruckTypeGrid.js', 'utf8');
const route = readFileSync('src/components/ui/v1/RouteLine.js', 'utf8');
const createTrip = readFileSync('src/screens/CreateTripScreen.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');

test('truck selector separates freight, LCV and special vehicles', () => {
  assert.match(grid, /freight: \['tent', 'ref', 'izoterm', 'closed', 'container', 'platform', 'tandem', 'longliner'\]/);
  assert.match(grid, /lcv: \['lcv_tent', 'lcv_van', 'lcv_flatbed', 'lcv_ref', 'microvan'\]/);
  assert.match(grid, /special: \['tanker', 'dumptruck', 'auto', 'lowloader', 'grain', 'livestock', 'logger', 'manipulator'\]/);
  assert.doesNotMatch(grid.slice(grid.indexOf('TRUCK_TYPE_GROUPS'), grid.indexOf('const LEGACY_GROUP')), /hazmat|cont20|cont40|jumbo|mega|curtain/);
  assert.match(grid, /width: '48\.5%'/);
});

test('ADR is explanatory profile data and not a selectable body card', () => {
  assert.match(grid, /truck_adr_profile_hint/);
  assert.ok(i18n.includes("truck_adr_profile_hint: 'Допуск ADR — характеристика водителя и автомобиля, а не тип кузова.'"));
});

test('new cargo and trip numeric fields have no misleading example numbers', () => {
  for (const source of [createTrip, createCargo]) {
    assert.equal((source.match(/placeholder=""/g) || []).length >= 2, true);
    assert.doesNotMatch(source, /Например: 31\.5|Например: 110/);
  }
});

test('regular routes keep the destination on its own full-width row', () => {
  const regularRoute = route.slice(route.lastIndexOf('return ('), route.indexOf('const s ='));
  assert.match(regularRoute, /<View style=\{s\.pointRow\}>[\s\S]*\{from \|\| '—'\}[\s\S]*<View style=\{s\.pointRow\}>[\s\S]*\{to \|\| '—'\}/);
  assert.match(route, /city: \{ flex: 1, minWidth: 0/);
  assert.equal((regularRoute.match(/<View style=\{s\.pointRow\}>/g) || []).length, 2);
});

test('Dulaty–Kalzhat keeps Kalzhat below the origin and destination on one line', () => {
  assert.match(route, /splitDulatyKalzhat/);
  assert.match(route, /crossingCheckpoint/);
  assert.match(route, /crossingDestination/);
  assert.match(route, /numberOfLines=\{1\} ellipsizeMode="tail">\{to \|\| '—'\}/);
});
