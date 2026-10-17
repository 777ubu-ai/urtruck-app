import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/CargoDetail.js', 'utf8');

test('cargo owner acceptance acquires its lock before opening the confirmation', () => {
  const accept = source.slice(source.indexOf('testID="bid-accept"'), source.indexOf('testID="bid-counter"'));
  assert.ok(accept.indexOf('acquireSingleFlight(acceptConfirmLock, b.id)') < accept.indexOf('askConfirm('));
  assert.match(accept, /finally \{[\s\S]*releaseSingleFlight\(acceptConfirmLock, b\.id\)[\s\S]*setConfirmingBid\(null\)/);
  assert.match(accept, /if \(!ok\) return/);
  assert.match(accept, /marketAPI\.acceptBid\(b\.id\)/);
});

test('all competing owner bid controls are disabled while confirmation or request is active', () => {
  const ownerActions = source.slice(source.indexOf('testID="bid-accept"'), source.indexOf('testID="bid-accept-counter"'));
  assert.equal((ownerActions.match(/disabled=\{!!accepting \|\| !!rejecting \|\| !!confirmingBid\}/g) || []).length, 3);
});

test('accept cancel stays before the API call and network/HTTP failures are surfaced', () => {
  const accept = source.slice(source.indexOf('testID="bid-accept"'), source.indexOf('testID="bid-counter"'));
  assert.ok(accept.indexOf('if (!ok) return') < accept.indexOf('marketAPI.acceptBid'));
  assert.match(accept, /bidActionFailureMessage\(r, 'accept_failed', t\)/);
  assert.match(accept, /toast\(t\('no_connection'\), 'error'\)/);
});

test('reject prevents same-bid double taps until the request settles', () => {
  const pendingReject = source.slice(source.indexOf('testID="bid-reject"'), source.indexOf('testID="bid-accept-counter"'));
  assert.match(pendingReject, /acquireSingleFlight\(rejectBidLock, b\.id\)/);
  assert.match(pendingReject, /marketAPI\.rejectBid\(b\.id\)/);
  assert.match(pendingReject, /finally \{[\s\S]*releaseSingleFlight\(rejectBidLock, b\.id\)[\s\S]*setRejecting\(null\)/);
  const firstReject = source.indexOf('testID="bid-reject"');
  const secondReject = source.indexOf('testID="bid-reject"', firstReject + 1);
  const resolvedReject = source.slice(secondReject, source.indexOf('testID="bid-accept-counter"'));
  assert.match(resolvedReject, /acquireSingleFlight\(rejectBidLock, b\.id\)/);
  assert.match(resolvedReject, /finally \{[\s\S]*releaseSingleFlight\(rejectBidLock, b\.id\)/);
});

test('driver counter-offer accept and decline share a single-flight lock', () => {
  const acceptCounter = source.slice(source.indexOf('const acceptCounter ='), source.indexOf('const declineCounter ='));
  const declineCounter = source.slice(source.indexOf('const declineCounter ='), source.indexOf('const loadCargo ='));
  assert.match(acceptCounter, /acquireSingleFlight\(counterBidLock, bid\.id\)/);
  assert.match(acceptCounter, /marketAPI\.acceptCounterBid\(bid\.id\)/);
  assert.match(acceptCounter, /finally \{[\s\S]*releaseSingleFlight\(counterBidLock, bid\.id\)/);
  assert.match(declineCounter, /acquireSingleFlight\(counterBidLock, bid\.id\)/);
  assert.match(declineCounter, /marketAPI\.declineCounterBid\(bid\.id\)/);
  assert.match(declineCounter, /finally \{[\s\S]*releaseSingleFlight\(counterBidLock, bid\.id\)/);
  assert.match(source, /loading=\{counterBidAction === myPendingBid\.id\}/);
  assert.match(source, /disabled=\{!!counterBidAction\}/);
});
