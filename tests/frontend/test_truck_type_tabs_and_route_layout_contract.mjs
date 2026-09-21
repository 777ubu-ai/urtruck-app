import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const grid = readFileSync('src/components/TruckTypeGrid.js', 'utf8');
const route = readFileSync('src/components/ui/v1/RouteLine.js', 'utf8');
const createTrip = readFileSync('src/screens/CreateTripScreen.js', 'utf8');
const createCargo = readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const myTrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const favorites = readFileSync('src/screens/FavoritesScreen.js', 'utf8');
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

test('regular routes keep both flags and cities on one compact row', () => {
  const regularRoute = route.slice(route.lastIndexOf('return ('), route.indexOf('const s ='));
  assert.match(regularRoute, /<View style=\{s\.row\}[^>]*>[\s\S]*\{from \|\| '—'\}[\s\S]*arrow-right[\s\S]*\{to \|\| '—'\}/);
  assert.equal((regularRoute.match(/<View style=\{s\.pointRow\}>/g) || []).length, 0);
  assert.match(route, /fromCity: \{ flexShrink: 1, maxWidth: '42%' \}/);
  assert.match(route, /toCity: \{ flex: 1 \}/);
  assert.equal((regularRoute.match(/adjustsFontSizeToFit/g) || []).length, 2);
  assert.equal((regularRoute.match(/minimumFontScale=\{0\.8\}/g) || []).length, 2);
});

test('all compact list routes force a single line for each ordinary city', () => {
  for (const source of [myTrips, favorites]) {
    assert.doesNotMatch(source, /numberOfLines:\s*2/);
    assert.match(source, /numberOfLines:\s*1/);
  }
});

test('known border pairs keep checkpoint below origin and destination readable', () => {
  assert.match(route, /splitBorderPair/);
  const separatorSource = route.match(/\.split\(\/([^/]+)\/\)/)?.[1];
  assert.ok(separatorSource);
  assert.deepEqual('Дулаты → Калжат'.split(new RegExp(separatorSource)), ['Дулаты', 'Калжат']);
  assert.deepEqual('Чугучак → Бахты'.split(new RegExp(separatorSource)), ['Чугучак', 'Бахты']);
  assert.match(route, /чугучак.*tacheng.*塔城/);
  assert.match(route, /бахты.*bakhty.*巴克图/);
  assert.match(route, /crossingOrigin: \{ flexBasis: 88, maxWidth: 92/);
  assert.match(route, /crossingDestination: \{ flex: 1/);
  assert.match(route, /numberOfLines=\{1\} ellipsizeMode="tail">\{to \|\| '—'\}/);
});
