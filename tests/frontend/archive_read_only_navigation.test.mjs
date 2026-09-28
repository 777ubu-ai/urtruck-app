import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('nested My Trips route has an explicit Back control', () => {
  const header = read('src/components/ui/v1/RootHeader.js');
  const screen = read('src/screens/MyTripsScreen.js');
  assert.match(header, /showBack = false/);
  assert.match(header, /navigation\.goBack\(\)/);
  assert.match(screen, /showBack=\{route\?\.name === 'MyTripsList'\}/);
});

test('archive bids open detail screens in read-only mode', () => {
  const deals = read('src/screens/DealsScreen.js');
  assert.match(deals, /const readOnly = dealTab === 'archive' \|\| CLOSED_BID_STATUSES\.has\(bid\.status\)/);
  assert.match(deals, /source: readOnly \? 'archive' : 'deals'/);
});

test('cargo and trip details suppress bargaining actions in archive mode', () => {
  for (const path of ['src/screens/CargoDetail.js', 'src/screens/TripDetail.js']) {
    const source = read(path);
    assert.match(source, /readOnly = false/);
    assert.match(source, /\{!readOnly &&/);
  }
});

test('cargo uses authoritative my_bid instead of rendering two active prices', () => {
  const cargo = read('src/screens/CargoDetail.js');
  assert.match(cargo, /b\.bidder_id === d\.my_bid\.bidder_id/);
  assert.match(cargo, /rawBids\.push\(d\.my_bid\)/);
});
