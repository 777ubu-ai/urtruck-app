import test from 'node:test';
import assert from 'node:assert/strict';
import { canRepublishOwnedHistory, isOwnedHistory } from '../../src/utils/ownedListingHistory.js';

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

test('истёкшие, занятые и завершённые объявления нельзя повторно публиковать из истории', () => {
  for (const status of ['expired', 'taken', 'booked', 'in_transit', 'completed', 'delivered']) {
    assert.equal(canRepublishOwnedHistory(status), false, status);
  }
  for (const status of ['unpublished', 'cancelled', 'rejected']) assert.equal(canRepublishOwnedHistory(status), true);
});
