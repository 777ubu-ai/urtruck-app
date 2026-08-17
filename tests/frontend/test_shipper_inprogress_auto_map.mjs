import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const chat = readFileSync('src/screens/ChatScreen.js', 'utf8');
const track = readFileSync('src/screens/TrackTruckScreen.js', 'utf8');

assert.match(chat, /testID="deal-track-truck"[\s\S]{0,600}onPress=\{openDealMap\}/, 'Shipper tracking CTA must open full-screen map');
assert.doesNotMatch(chat, /testID="deal-track-truck"[\s\S]{0,2500}<TruckMap/, 'Shipper chat must not embed live/planned TruckMap');
assert.match(track, /const iv = setInterval\(load, 10000\)/, 'Live GPS polling must happen on the dedicated map screen');
assert.match(track, /routePoints=\{routePoints\}/, 'Full-screen map must always receive the planned route');
assert.match(track, /planned=\{!loc\}/, 'Before first GPS point the full-screen screen must show planned route');
console.log('shipper fullscreen tracking contract: PASS');
