import test from 'node:test';
import assert from 'node:assert/strict';
import { findPartnerDealRooms, fetchPartnerDealRooms } from '../../src/utils/driverDealRooms.js';

const room = (overrides = {}) => ({
  id: 'room-1', deal_id: 'deal-1', partner_id: 'driver-1', ...overrides,
});

test('profile contact can open only authenticated rooms linked to this partner and a deal', () => {
  const result = findPartnerDealRooms({ rooms: [
    room(), room({ id: 'room-2', deal_id: 'deal-2' }),
    room({ id: 'support', deal_id: 'support-deal', is_support: true }),
    room({ id: 'other', deal_id: 'deal-3', partner_id: 'driver-2' }),
    room({ id: 'legacy', deal_id: null }),
    room(),
  ] }, 'driver-1');

  assert.deepEqual(result.map(({ id, deal_id }) => [id, deal_id]), [
    ['room-1', 'deal-1'], ['room-2', 'deal-2'],
  ]);
});

test('a successful empty room response is distinct from an API failure', () => {
  assert.deepEqual(findPartnerDealRooms({ rooms: [] }, 'driver-1'), []);
  assert.throws(() => findPartnerDealRooms(null, 'driver-1'), /invalid_rooms_response/);
  assert.throws(() => findPartnerDealRooms({ rooms: null }, 'driver-1'), /invalid_rooms_response/);
});

test('partner room lookup follows all pages and deduplicates overlapping IDs', async () => {
  const calls = [];
  const pages = new Map([
    [0, { partner_id: 'driver-1', partner_filter_applied: true, rooms: [room()], has_more: true, next_offset: 50 }],
    [50, { partner_id: 'driver-1', partner_filter_applied: true, rooms: [room(), room({ id: 'room-older', deal_id: 'deal-older' })], has_more: false, next_offset: null }],
  ]);
  const result = await fetchPartnerDealRooms(async (offset) => {
    calls.push(offset);
    return pages.get(offset);
  }, 'driver-1');
  assert.deepEqual(calls, [0, 50]);
  assert.deepEqual(result.map(({ id }) => id), ['room-1', 'room-older']);
});

test('partner room lookup rejects legacy unfiltered responses and non-advancing cursors', async () => {
  await assert.rejects(fetchPartnerDealRooms(async () => ({ rooms: [] }), 'driver-1'), /contract_unavailable/);
  await assert.rejects(fetchPartnerDealRooms(async () => ({
    partner_id: 'driver-1', partner_filter_applied: true, rooms: [], has_more: true, next_offset: 0,
  }), 'driver-1'), /cursor_invalid/);
});
