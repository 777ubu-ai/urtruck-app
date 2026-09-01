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

test('CargoDetail does not offer a new bid on a closed or already accepted cargo', () => {
  assert.match(cargoDetail, /CLOSED_CARGO_STATUSES_FOR_BIDS = new Set\(\[/);
  for (const status of ['taken', 'booked', 'completed', 'cancelled', 'unpublished', 'expired']) {
    assert.match(cargoDetail, new RegExp(`['"]${status}['"]`));
  }
  assert.match(cargoDetail, /const cargoClosedForNewBids = CLOSED_CARGO_STATUSES_FOR_BIDS\.has/);
  assert.match(cargoDetail, /const canCreateBid = !c\.isMine && !dealStatus && !acceptedBid && !myPendingBid && !cargoClosedForNewBids;/);
  assert.match(cargoDetail, /\{canCreateBid \? \(\s*<StickyCTABar/);
  assert.match(cargoDetail, /const bidModalVisible = bidModal && \(bidModalMode !== 'create' \|\| canCreateBid\);/);
  assert.match(cargoDetail, /visible=\{bidModalVisible\}/);
});
