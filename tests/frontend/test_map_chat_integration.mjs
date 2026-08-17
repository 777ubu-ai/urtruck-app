import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreen.js', 'utf8');
const dealRoom = readFileSync('src/components/deal/DealRoom.js', 'utf8');
const track = readFileSync('src/screens/TrackTruckScreen.js', 'utf8');

assert.match(
  dealRoom,
  /const showAutomaticRouteMap = false/,
  'deal room must keep the conversation compact instead of embedding a large map',
);
assert.doesNotMatch(
  chat,
  /dealMapCard[\s\S]{0,2500}<TruckMap/,
  'deal chat must not render the tracking map inside the conversation',
);
assert.match(
  chat,
  /testID="deal-track-truck"[\s\S]{0,700}onPress=\{openDealMap\}/,
  'shipper must be able to open the dedicated tracking screen',
);
assert.match(
  chat,
  /testID="deal-open-driver-route"[\s\S]{0,700}onPress=\{openDealMap\}/,
  'driver must be able to open the dedicated route screen',
);
assert.match(
  chat,
  /navigation\.navigate\('TrackTruck'/,
  'map actions must navigate to the dedicated TrackTruck screen',
);
assert.match(track, /<TruckMap/, 'TrackTruckScreen must own the map rendering');
assert.match(
  track,
  /cleanMapWrap: \{ flex: 1, marginHorizontal: 0, marginBottom: 0, borderRadius: 0/,
  'tracking map must use the full available screen below the compact header',
);
assert.match(
  track,
  /const iv = setInterval\(load, 10000\)/,
  'live location polling must run only while the dedicated tracking screen is open',
);

console.log('map/chat fullscreen integration contract: PASS');
