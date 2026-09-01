import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const cargoDetail = readFileSync(new URL('../../src/screens/CargoDetail.js', import.meta.url), 'utf8');

test('CargoDetail renders server my_bid even when dirty-filter removed it from bids', () => {
  assert.match(cargoDetail, /const mapBid = \(b\) => \(\{/);
  assert.match(cargoDetail, /const mapped = \(d\.bids \|\| \[\]\)\.map\(mapBid\);/);
  assert.match(cargoDetail, /if \(d\.my_bid && !mapped\.some\(\(b\) => b\.id === d\.my_bid\.id\)\) \{/);
  assert.match(cargoDetail, /mapped\.push\(mapBid\(d\.my_bid\)\);/);
});

