import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');
const trackSrc = fs.readFileSync('src/screens/TrackTruckScreen.js', 'utf8');

test('shipper cannot mark an in-progress trip delivered', () => {
  assert.doesNotMatch(src, /isShipperSide\s*&&\s*\(deal\.status === 'in_progress'/);
  assert.match(src, /isShipperSide\s*&&\s*deal\.status === 'delivered'/);
  assert.match(src, /action = \{ key: 'completed'/);
});

test('driver delivery and shipper receipt require separate actions', () => {
  assert.match(src, /action = \{ key: 'at_border'/);
  assert.match(src, /deal-action-mark-at-border/);
  assert.match(src, /action = \{ key: 'delivered'/);
  assert.match(src, /deal-action-mark-arrived/);
  assert.match(src, /deal-action-confirm-receipt/);
  assert.match(src, /window\.confirm\(message\)/);
});

test('start trip is the only driver action and starts location internally', () => {
  assert.match(src, /action = \{ key: 'in_progress', icon: 'truck', label: t\('start_delivery'\) \}/);
  assert.match(src, /const startTrip = async/);
  assert.match(src, /ensureBackgroundLocationPermission\(\)/);
  assert.doesNotMatch(src, /deal-action-allow-gps-start/);
  assert.doesNotMatch(src, /deal-tracking-driver-request/);
  assert.match(src, /changeDealStatus\('in_progress'\)/);
});

test('live map returns to deal chat instead of exposing a call action', () => {
  assert.match(trackSrc, /testID="track-message-driver"/);
  assert.match(trackSrc, /t\('write_driver'\)/);
  assert.match(trackSrc, /navigation\.goBack\(\)/);
  assert.doesNotMatch(trackSrc, /name="phone"/);
  assert.doesNotMatch(src, /chat-header-call-btn/);
});
