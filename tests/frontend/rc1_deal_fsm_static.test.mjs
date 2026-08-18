import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');
const trackSrc = fs.readFileSync('src/screens/TrackTruckScreen.js', 'utf8');
const webMapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const geoSrc = fs.readFileSync('src/utils/geo.js', 'utf8');

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
  assert.match(src, /const askConfirm = React\.useCallback/);
  assert.match(src, /<AppConfirmModal/);
  assert.match(src, /testID="chat-confirm-modal"/);
  assert.doesNotMatch(src, /window\.confirm\(/);
});

test('start trip is the only driver action and starts location internally', () => {
  assert.match(src, /action = \{ key: 'in_progress', icon: 'truck', label: t\('start_delivery'\) \}/);
  assert.match(src, /const startTrip = async/);
  assert.match(src, /ensureBackgroundLocationPermission\(\)/);
  assert.doesNotMatch(src, /deal-action-allow-gps-start/);
  assert.doesNotMatch(src, /deal-tracking-driver-request/);
  assert.match(src, /changeDealStatus\('in_progress'\)/);
});

test('clean live map returns to deal chat without exposing a call action', () => {
  assert.match(trackSrc, /navigation\.goBack\(\)/);
  assert.match(trackSrc, /<TruckMap[\s\S]*showBadge=\{false\}/);
  assert.doesNotMatch(trackSrc, /track-message-driver|write_driver|name="phone"/);
  assert.doesNotMatch(src, /chat-header-call-btn/);
});

test('shipper opens fullscreen tracking instead of embedding a live map in chat', () => {
  assert.match(src, /testID="deal-track-truck"/);
  assert.match(src, /onPress=\{openDealMap\}/);
  assert.match(src, /navigation\.navigate\('TrackTruck'/);
  assert.match(src, /viewerRole: role/);
  assert.doesNotMatch(src, /marketAPI\.getDealLocation\(dealId\)/);
  assert.doesNotMatch(src, /<TruckMap[\s\S]*testID="deal-track-truck"/);
});

test('driver opens the internal deal map without leaving UrTruck', () => {
  assert.match(src, /const DRIVER_ROUTE_STATUSES = \['accepted', 'in_progress', 'at_border', 'delivered'\]/);
  assert.match(src, /const openDealMap = \(\) =>/);
  assert.match(src, /testID="deal-open-driver-route"/);
  assert.match(src, /t\('open_route_btn'\)/);
  assert.doesNotMatch(src, /https:\/\/yandex\.ru\/maps\/\?rtext=/);
  assert.match(src, /navigation\.navigate\('TrackTruck'/);
  assert.match(src, /viewerRole: role/);
  assert.doesNotMatch(trackSrc, /Linking\.openURL/);
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
