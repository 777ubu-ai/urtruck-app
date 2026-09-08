// Track B / B1 migration (2026-09-08): originally read src/screens/ChatScreen.js
// (dead — nothing imports it) and asserted GPS polling only ran while a
// separate TrackTruckScreen was mounted. DealWorkspaceScreenV2.js merged
// chat and map into one screen with a view toggle, so location polling is
// now scoped to the whole deal-workspace mount (gated on trackingActive,
// i.e. the deal's status) rather than to which of the two views is
// currently showing — the map needs fresh data the instant it's opened,
// not 10s later. That's a real, deliberate behavior change from the old
// screen, not a bug; this test asserts the *current* contract instead of
// forcing the old one onto code that no longer works that way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dealWorkspace = readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');

assert.match(dealWorkspace, /const timer = setInterval\(refreshLocation, 10000\);/, 'live GPS polling must run every 10s, matching the old TrackTruckScreen cadence');
assert.match(dealWorkspace, /if \(!trackingActive\) return undefined;/, 'polling must stop (no timer) once the deal is outside its live-tracking statuses, not run forever');
assert.match(dealWorkspace, /routePoints=\{routePoints\}/, 'the embedded map must always receive the planned route');
assert.match(dealWorkspace, /planned=\{!hasLivePoint\}/, 'before the first GPS point the embedded map must show the planned route, not an empty state');
console.log('shipper embedded-map tracking contract: PASS');
