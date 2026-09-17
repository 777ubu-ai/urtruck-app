// Track B / B1 migration (2026-09-08): originally read src/screens/ChatScreen.js
// (dead — nothing imports it, see the Track B dead-code manifest). DealRoom.js
// itself was, and still is, live (rendered from DealsScreen.js /
// ChatsListLegacyScreen.js). The chat-side contract is rewritten against
// DealWorkspaceScreenV2.js, the screen every real entry point into an
// accepted deal actually mounts (via DealWorkspaceRoute).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dealRoom = readFileSync(new URL('../../src/components/deal/DealRoom.js', import.meta.url), 'utf8');
const dealWorkspace = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const track = readFileSync(new URL('../../src/screens/TrackTruckScreen.js', import.meta.url), 'utf8');

assert.match(dealRoom, /const showAutomaticRouteMap = false/, 'DealRoomCard must not embed the route map inside the deals list card');
assert.match(dealWorkspace, /testID="deal-header-map"/, 'the deal workspace must offer a way to open the live map');
assert.match(dealWorkspace, /testID="deal-map-fullscreen"/, 'the live map must render as its own full-screen area, not inline in the list');
assert.match(track, /<TruckMap/, 'TrackTruckScreen still owns a standalone map for whatever future callers may need it (see Track B report: currently orphaned, nothing navigates to it)');

console.log('deal room / deal workspace fullscreen map contract: PASS');
