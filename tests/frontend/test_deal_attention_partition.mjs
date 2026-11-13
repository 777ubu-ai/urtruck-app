import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionTarget, partitionDealAttention } from '../../src/utils/dealAttention.js';
const bid = (id, cargo_id) => ({ kind: 'bid', data: { id, cargo_id } });
const deal = (id, chat_room_id) => ({ kind: 'deal', data: { id, chat_room_id } });
const groups = { offers: [bid('open','cargo')], active: [deal('live','room')], archive: [bid('closed','cargo'), deal('done','old-room')] };
for (const url of ['/deals/live','https://urtruck.kz/deals/live','urtruck://deals/live','com.urtruck.app://deals/live']) {
  test(`route preserved: ${url}`, () => assert.equal(attentionTarget(url).id, 'live'));
}
test('rejected bid and active message partition once, archive remains marked', () => {
  const result = partitionDealAttention({ badge: 3, notifications: [{ id: 1, type: 'bid_rejected', url: '/cargos/cargo?bid=closed' }], rooms: [{ room_id: 'room', unread_count: 2 }] }, groups);
  assert.deepEqual(result.tabs, { offers: 0, active: 2, archive: 1 });
  assert.equal(result.counts['bid:closed'], 1);
  assert.equal(result.counts['deal:live'], 2);
});
test('51st unread event is not lost behind read history', () => {
  const result = partitionDealAttention({ badge: 1, notifications: [{ id: 51, type: 'deal_status', url: 'urtruck://deals/live' }], rooms: [] }, groups);
  assert.deepEqual(result.tabs, { offers: 0, active: 1, archive: 0 });
});
test('legacy listing-only rejection prefers closed bid, never all matching cards', () => {
  const result = partitionDealAttention({ badge: 1, notifications: [{ id: 1, type: 'bid_rejected', url: '/cargos/cargo' }], rooms: [] }, groups);
  assert.deepEqual(result.counts, { 'bid:closed': 1 });
});
test('missing entity remains discoverable in archive, not phantom badge', () => {
  const result = partitionDealAttention({ badge: 2, notifications: [{ id: 1, url: '/deals/missing', title: 'Archived event' }], rooms: [{ room_id: 'standalone', unread_count: 1 }] }, groups);
  assert.deepEqual(result.tabs, { offers: 0, active: 0, archive: 2 });
  assert.equal(result.fallback[0].data.notificationId, 1);
  assert.equal(result.fallback[1].data.roomId, 'standalone');
});
test('reading one source preserves other tabs, reading all clears all', () => {
  const after = partitionDealAttention({ badge: 1, notifications: [{ id: 1, url: '/cargos/cargo?bid=closed' }], rooms: [] }, groups);
  assert.equal(after.tabs.archive, 1);
  assert.equal(after.tabs.active, 0);
  assert.deepEqual(partitionDealAttention({ badge: 0, notifications: [], rooms: [] }, groups).tabs, { offers: 0, active: 0, archive: 0 });
});
test('inconsistent snapshot is rejected rather than displaying fabricated counts', () => {
  assert.equal(partitionDealAttention({ badge: 7, notifications: [], rooms: [] }, groups), null);
});

test('event_key resolves the exact rejected bid when listing has several bids', () => {
  const snapshot = { badge: 1, notifications: [{ id: 1, type: 'bid_rejected', url: '/cargos/cargo', event_key: 'bid:closed:rejected' }], rooms: [] };
  const result = partitionDealAttention(snapshot, { ...groups, archive: [bid('another','cargo'),bid('closed','cargo')] });
  assert.deepEqual(result.counts, { 'bid:closed': 1 });
  snapshot.notifications[0].event_key = 'bid:missing:rejected';
  assert.equal(partitionDealAttention(snapshot,groups).fallback.length,1);
});

test('accepted bid event moves to its active deal instead of phantom archive entry', () => {
  const g={...groups,active:[{kind:'deal',data:{id:'live',cargo_id:'cargo',chat_room_id:'room'}}]};
  const result=partitionDealAttention({badge:1,notifications:[{id:1,type:'bid',event_key:'bid:accepted-bid:accepted',url:'/cargos/cargo'}],rooms:[]},g);
  assert.deepEqual(result.tabs,{offers:0,active:1,archive:0});
  assert.equal(result.counts['deal:live'],1);
});
