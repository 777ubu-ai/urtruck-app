import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BID_TTL_MS,
  bidExpiryAt,
  formatBidRemaining,
  isBidFresh,
} from '../../src/utils/bidExpiry.js';

const NOW = Date.parse('2026-08-20T12:00:00Z');


test('bid TTL is exactly 48 hours from last activity', () => {
  const bid = {
    status: 'pending',
    created_at: '2026-08-18 10:00:00',
    updated_at: '2026-08-20 11:00:00',
  };
  assert.equal(bidExpiryAt(bid).getTime(), Date.parse('2026-08-22T11:00:00Z'));
  assert.equal(bidExpiryAt(bid).getTime() - Date.parse('2026-08-20T11:00:00Z'), BID_TTL_MS);
});


test('recent counter/update resets freshness window', () => {
  const bid = {
    status: 'countered',
    created_at: '2026-08-15 10:00:00',
    updated_at: '2026-08-20 11:00:00',
  };
  assert.equal(isBidFresh(bid, NOW), true);
});


test('bid older than 48 hours is not actionable', () => {
  const bid = {
    status: 'pending',
    created_at: '2026-08-18 10:00:00',
    updated_at: '2026-08-18 10:00:00',
  };
  assert.equal(isBidFresh(bid, NOW), false);
  assert.equal(formatBidRemaining(bid, 'RU', NOW), '');
});


test('terminal bid is never fresh even with a recent timestamp', () => {
  const bid = { status: 'expired', updated_at: '2026-08-20 11:59:00' };
  assert.equal(isBidFresh(bid, NOW), false);
});


test('remaining-time copy is localized for all supported deal languages', () => {
  const bid = { status: 'pending', updated_at: '2026-08-20 11:00:00' };
  assert.equal(formatBidRemaining(bid, 'RU', NOW), 'Осталось 1 д 23 ч');
  assert.equal(formatBidRemaining(bid, 'EN', NOW), '1d 23h left');
  assert.equal(formatBidRemaining(bid, 'ZH', NOW), '剩余1天23小时');
  assert.equal(formatBidRemaining(bid, 'KK', NOW), '1 күн 23 сағ қалды');
});
