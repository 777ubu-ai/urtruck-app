import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dealRoom = readFileSync('src/components/deal/DealRoom.js', 'utf8');
const chat = readFileSync('src/screens/ChatScreen.js', 'utf8');
const track = readFileSync('src/screens/TrackTruckScreen.js', 'utf8');

assert.match(dealRoom, /const showAutomaticRouteMap = false/, 'DealRoomCard must not embed the route map inside chat');
assert.match(chat, /navigation\.navigate\('TrackTruck'/, 'Deal chat must open the dedicated TrackTruck screen');
assert.match(chat, /testID="deal-open-driver-route"/, 'Driver must have a full-screen route CTA');
assert.match(chat, /testID="deal-track-truck"/, 'Shipper must have a full-screen tracking CTA');
assert.match(track, /<TruckMap/, 'TrackTruckScreen must own the actual map');
assert.match(track, /cleanMapWrap: \{ flex: 1, marginHorizontal: 0, marginBottom: 0, borderRadius: 0/, 'TrackTruck map must be edge-to-edge');

console.log('deal room fullscreen map contract: PASS');
