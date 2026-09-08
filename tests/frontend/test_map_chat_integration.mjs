// Track B / B1 migration (2026-09-08): originally read src/screens/ChatScreen.js
// (dead — nothing imports it). Rewritten against DealWorkspaceScreenV2.js,
// which replaced "chat has a button that navigates to a separate TrackTruck
// screen" with a same-screen view toggle. The product intent this test
// protects — the live/planned tracking map never renders inline inside the
// scrollable conversation — still holds, just via a different mechanism
// (two mutually exclusive render branches instead of two screens).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dealRoom = readFileSync(new URL('../../src/components/deal/DealRoom.js', import.meta.url), 'utf8');
const dealWorkspace = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const track = readFileSync(new URL('../../src/screens/TrackTruckScreen.js', import.meta.url), 'utf8');

assert.match(
  dealRoom,
  /const showAutomaticRouteMap = false/,
  'deal room card must keep the deals list compact instead of embedding a large map',
);

// The chat branch (viewMode === VIEW_CHAT, which owns the scrollable
// FlatList of messages) must not itself render TruckMap — the map only
// exists in the sibling VIEW_MAP branch, mutually exclusive with chat.
const chatBranchStart = dealWorkspace.indexOf('{viewMode === VIEW_CHAT ? (');
const chatBranchEnd = dealWorkspace.indexOf(') : (', chatBranchStart);
assert.ok(chatBranchStart > -1 && chatBranchEnd > chatBranchStart, 'could not locate the chat/map view-mode branches — DealWorkspaceScreenV2.js structure changed, re-check this test');
const chatBranch = dealWorkspace.slice(chatBranchStart, chatBranchEnd);
assert.doesNotMatch(chatBranch, /<TruckMap/, 'deal chat must not render the tracking map inside the conversation view');

assert.match(dealWorkspace, /testID="deal-header-map"[\s\S]{0,50}accessibilityLabel/, 'there must be a control that opens the full-screen map');
assert.match(dealWorkspace, /onPress=\{openMap\}/, 'the map control must open the map in place, not navigate elsewhere');
assert.doesNotMatch(dealWorkspace, /navigation\.navigate\('TrackTruck'/, 'the live deal workspace must not navigate to the orphaned TrackTruck screen (see Track B report)');

assert.match(track, /<TruckMap/, 'TrackTruckScreen still owns map rendering for whatever still points at it');
assert.match(
  track,
  /cleanMapWrap: \{ flex: 1, marginHorizontal: 0, marginBottom: 0, borderRadius: 0/,
  'if TrackTruckScreen is ever reconnected, its map must still use the full available screen',
);
assert.match(
  track,
  /const iv = setInterval\(load, 10000\)/,
  'TrackTruckScreen live location polling must still be scoped to when that screen itself is mounted',
);

console.log('map/chat fullscreen integration contract: PASS');
