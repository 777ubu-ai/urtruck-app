import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bargainCard = fs.readFileSync('src/components/deal/BargainCard.js', 'utf8');
const cargoDetail = fs.readFileSync('src/screens/CargoDetail.js', 'utf8');
const tripDetail = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');

test('bargain cards honor QA-only bargain-depth fields when backend requires them', () => {
  assert.match(bargainCard, /const minActions = Number\(bid\.bargain_min_actions \|\| 5\)/);
  assert.match(bargainCard, /const priceActions = Number\(bid\.bargain_price_actions \|\| 0\)/);
  assert.match(bargainCard, /const gateRequired = bid\.bargain_gate_required === true/);
  assert.match(bargainCard, /const canOwnerAccept = bid\.bargain_can_accept !== false/);
  assert.match(bargainCard, /const canBidderAcceptCounter = bid\.bargain_counter_can_accept !== false/);
  assert.match(bargainCard, /label=\{canOwnerAccept \? t\('accept'\) : depthLabel\}/);
  assert.match(bargainCard, /disabled=\{!canOwnerAccept\}/);
  assert.match(bargainCard, /label=\{canBidderAcceptCounter \? t\('bargain_accept_counter'\) : depthLabel\}/);
  assert.match(bargainCard, /disabled=\{!canBidderAcceptCounter\}/);
});

test('cargo and trip detail screens carry server bargain-depth fields into UI actions', () => {
  for (const source of [cargoDetail, tripDetail]) {
    assert.match(source, /bargainPriceActions: Number\(b\.bargain_price_actions \|\| 0\)/);
    assert.match(source, /bargainMinActions: Number\(b\.bargain_min_actions \|\| 5\)/);
    assert.match(source, /bargainGateRequired: b\.bargain_gate_required === true/);
    assert.match(source, /bargainCanAccept: b\.bargain_can_accept !== false/);
    assert.match(source, /bargainCounterCanAccept: b\.bargain_counter_can_accept !== false/);
    assert.match(source, /t\('bargain_depth_progress'\)/);
  }
  assert.match(cargoDetail, /disabled=\{!!accepting \|\| !!rejecting \|\| !canAcceptBid\}/);
  assert.match(cargoDetail, /disabled=\{!canAcceptCounter\}/);
  assert.match(tripDetail, /disabled=\{!!accepting \|\| !!rejecting \|\| !canAcceptBid\}/);
  assert.match(tripDetail, /disabled=\{counterActing \|\| !myBidCanAcceptCounter\}/);
});

test('bargain depth copy exists for all supported locales', () => {
  assert.match(i18n, /bargain_depth_progress:\s*'Торг \{done\}\/\{min\}'/);
  assert.match(i18n, /bargain_depth_progress:\s*'Сауда \{done\}\/\{min\}'/);
  assert.match(i18n, /bargain_depth_progress:\s*'议价 \{done\}\/\{min\}'/);
  assert.match(i18n, /bargain_depth_progress:\s*'Bargain \{done\}\/\{min\}'/);
});
