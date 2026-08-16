import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/screens/ChatScreen.js', 'utf8');
assert.match(s, /parseRouteCities/, 'ChatScreen must derive route coordinates');
assert.match(s, /IS_WEB && dealRoutePoints\.length >= 2/, 'web shipper must see planned map without GPS');
assert.match(s, /planned=\{!hasMapPreviewPoint\}/, 'planned state must be explicit when GPS is absent');
assert.match(s, /routePoints=\{dealRoutePoints\}/, 'planned and live map must share deal route');
assert.doesNotMatch(s, /deal-track-truck[\s\S]{0,2200}track_truck_waiting[\s\S]{0,500}track_truck_btn/, 'no-GPS web path must not require opening a waiting screen');
console.log('shipper in-progress automatic map contract: PASS');
