import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../../src/screens/DealsScreen.js', import.meta.url), 'utf8');

test('client offers tab renders each incoming bid as its own deal card', () => {
  assert.match(source, /role === 'client'[\s\S]*return incomingBids/);
  assert.match(source, /\.filter\(\(bid\) => bid\.cargo_id && OPEN_BID_STATUSES\.has\(bid\.status\) && isBidFresh\(bid\)\)/);
  assert.match(source, /\.map\(\(bid\) => \(\{ \.\.\.bid, _incoming: true \}\)\)/);
  assert.match(source, /const offerCount = offersData\.length/);
  assert.match(source, /kind: 'bid'/);
  assert.doesNotMatch(source, /kind === 'offer'/);
  assert.doesNotMatch(source, /kind: role === 'client' \? 'offer' : 'bid'/);
  assert.doesNotMatch(source, /deals-cargo-offer/);
  assert.doesNotMatch(source, /active_bids_count/);
  assert.doesNotMatch(source, /min_bid_price/);
});

test('incoming cargo offers show the bidder name and keep bidId navigation', () => {
  assert.match(source, /const isIncomingCargoOffer = role === 'client' && data\._incoming && data\.cargo_id/);
  assert.match(source, /const offerTitle = data\.bidder_name \|\| t\('role_driver'\)/);
  assert.match(source, /routeLabel=\{isIncomingCargoOffer \? offerTitle : routeFor\(data, 'bid'\)\}/);
  assert.match(source, /navigation\.navigate\('CargoDetail', \{ cargoId: bid\.cargo_id, bidId: bid\.id, role \}\)/);
});
