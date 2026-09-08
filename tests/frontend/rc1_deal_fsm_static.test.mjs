// Track B / B1 migration (2026-09-08): this file used to read
// src/screens/ChatScreen.js (dead — nothing imports it). Its FSM assertions
// were duplicates of tests/frontend/rc1_deal_fsm_static.mjs (now migrated to
// real dealActionResolver.js unit tests, see that file) — not repeated here.
// The map-navigation assertions described a screen-navigation architecture
// ("chat opens a separate TrackTruck screen") that DealWorkspaceScreenV2.js
// replaced with a same-screen view toggle (viewMode: 'chat' | 'map', see
// openMap/closeMap). They're rewritten below against the live screen.
//
// Investigation note (kept for the record, not asserted as a test): the old
// "no call button while the map is open" check has no live equivalent to
// migrate — DealWorkspaceScreenV2.js's call menu (testID="deal-call-menu")
// is never opened by *any* on-screen control in the current build
// (setCallMenuOpen(true) does not appear anywhere in the file, only
// setCallMenuOpen(false) x8). That's a product gap worth the owner's
// attention on its own, tracked in the Track B report — not something to
// paper over with a fabricated assertion here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dealWorkspace = fs.readFileSync(new URL('../../src/screens/DealWorkspaceScreenV2.js', import.meta.url), 'utf8');
const trackSrc = fs.readFileSync(new URL('../../src/screens/TrackTruckScreen.js', import.meta.url), 'utf8');
const webMapSrc = fs.readFileSync(new URL('../../src/components/TruckMap.web.js', import.meta.url), 'utf8');
const geoSrc = fs.readFileSync(new URL('../../src/utils/geo.js', import.meta.url), 'utf8');

test('opening the map hides the chat header (and everything in it) instead of leaving it visible', () => {
  // compactHeader (which holds the map/status header buttons) is only
  // wired in as the chat FlatList's ListHeaderComponent, itself gated on
  // viewMode === VIEW_CHAT — so switching to the map view unmounts it
  // entirely rather than layering the map on top of it.
  assert.match(dealWorkspace, /viewMode === VIEW_CHAT \? \(/);
  assert.match(dealWorkspace, /ListHeaderComponent=\{compactHeader\}/);
});

test('the deal workspace opens its map in place, not by navigating to a separate screen', () => {
  assert.match(dealWorkspace, /const openMap = \(\) => \{ setAttachOpen\(false\); setCallMenuOpen\(false\); setViewMode\(VIEW_MAP\); \};/);
  assert.match(dealWorkspace, /const closeMap = \(\) => setViewMode\(VIEW_CHAT\);/);
  assert.match(dealWorkspace, /testID="deal-header-map"/);
  assert.match(dealWorkspace, /testID="deal-map-fullscreen"/);
  // Neither role's entry point should navigate away for the live map —
  // TrackTruckScreen is only reachable from the (dead) legacy ChatScreen.js,
  // see the Track B report's dead-code / orphaned-route finding.
  assert.doesNotMatch(dealWorkspace, /navigation\.navigate\('TrackTruck'/);
});

test('the embedded map is a modal-like overlay you explicitly collapse back to chat, not a permanent split view', () => {
  assert.match(dealWorkspace, /testID="deal-map-collapse"/);
  assert.match(dealWorkspace, /onPress=\{closeMap\}\s+testID="deal-map-collapse"/);
  assert.match(dealWorkspace, /onPress=\{closeMap\}\s+testID="deal-chat-dock"/);
});

test('deal route map is visible before first GPS point', () => {
  assert.match(trackSrc, /testID=\{loc \? "track-live-map" : "track-planned-map"\}/);
  assert.match(trackSrc, /parseRouteCities/);
  assert.match(trackSrc, /routePoints=\{routePoints\}/);
  assert.match(trackSrc, /planned=\{!loc\}/);
  assert.match(trackSrc, /showBadge=\{false\}/);
  assert.doesNotMatch(trackSrc, /: !loc \? \(\s*<View style=\{s\.empty\}>/s);
});

test('web deal map uses Yandex JS API 2.1 only and resolves Bakhty-Chuguchak', () => {
  assert.match(webMapSrc, /globalThis\.ymaps/);
  assert.match(webMapSrc, /new api\.Map/);
  assert.match(webMapSrc, /api\.multiRouter\.MultiRoute/);
  assert.match(webMapSrc, /testID="truck-map-yandex-web"/);
  assert.doesNotMatch(webMapSrc, /tile\.openstreetmap\.org|unpkg\.com\/leaflet|OpenStreetMapFallback|truck-map-osm-fallback|useFallback|LEAFLET_JS/);
  assert.match(webMapSrc, /truck-map-yandex-error/);
  assert.match(geoSrc, /'Бахты': \[46\.679365, 82\.776816\]/);
  assert.match(geoSrc, /'Чугучак': \[46\.739131, 82\.983797\]/);
  assert.match(geoSrc, /isBakhtyTachengBorderPair/);
  assert.match(geoSrc, /return \[CITIES\['Бахты'\]\]/);
});
