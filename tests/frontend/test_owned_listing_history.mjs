import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedHistory } from '../../src/utils/ownedListingHistory.js';

test('история содержит все закрытые и занятые статусы без изменения данных', () => {
  for (const driver of [false, true]) {
    for (const status of ['expired', 'unpublished', 'cancelled', 'rejected', 'taken', 'booked', 'in_transit', 'completed', 'delivered']) {
      assert.equal(isOwnedHistory({ status }, driver), true, status);
    }
    assert.equal(isOwnedHistory({ status: 'active' }, driver), false);
    assert.equal(isOwnedHistory({ status: null }, driver), false);
  }
  assert.equal(isOwnedHistory({ status: 'draft' }, true), false);
});

import { readFileSync } from 'node:fs';
test('личные разделы не предлагают ручное восстановление или продление', () => {
  const source = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
  for (const action of ['republish-btn', 'extend-oneclick-btn', 'extend-editdate-btn', 'marketAPI.republishCargo(', 'marketAPI.republishTrip(', 'marketAPI.extendCargo(', 'marketAPI.extendTrip(']) {
    assert.equal(source.includes(action), false, action);
  }
});
