import test from 'node:test';
import assert from 'node:assert/strict';
import { countActiveDealBusinessActions, countOfferBusinessActions, isDealBusinessActionRequired } from '../../src/utils/dealsBusinessActions.js';

test('actionable offers remain visible independently of canonical unread snapshot', () => {
  const offers = [
    { status: 'pending', _incoming: true },
    { status: 'countered', _incoming: false },
    { status: 'pending', _incoming: false },
    { status: 'rejected', _incoming: true },
  ];
  assert.equal(countOfferBusinessActions(offers), 2);
});

test('GPS and receipt confirmation remain action signals without becoming unread events', () => {
  const deals = [
    { status: 'in_progress', tracking_action_required: true },
    { status: 'delivered' },
    { status: 'awaiting_confirmation' },
    { status: 'completed', tracking_action_required: true },
  ];
  assert.equal(countActiveDealBusinessActions(deals, 'client'), 3);
  assert.equal(countActiveDealBusinessActions(deals, 'driver'), 1);
  assert.equal(isDealBusinessActionRequired(deals[1], 'driver'), false);
});
