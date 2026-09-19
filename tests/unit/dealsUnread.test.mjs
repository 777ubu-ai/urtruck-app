import assert from 'node:assert/strict';
import { computeDealsUnread } from '../../src/utils/dealsUnread.js';

const dashboard = {
  my_deals: [
    { status: 'accepted', unread_count: 0, tracking_action_required: 1 },
    { status: 'completed', unread_count: 9, tracking_action_required: 0 },
  ],
  my_bids: [],
  incoming_bids: [],
};

assert.equal(computeDealsUnread(dashboard), 1);
console.log('✓ pending GPS request is visible in Deals badge');

assert.equal(computeDealsUnread({
  my_deals: [{ status: 'completed', unread_count: 9 }],
  my_bids: [],
  incoming_bids: [],
}), 0);
assert.equal(computeDealsUnread({
  my_deals: [{ status: 'accepted', unread_count: '2' }],
  my_bids: [],
  incoming_bids: [],
}), 2);
console.log('✓ closed deals stay hidden and numeric unread counts are normalized');
