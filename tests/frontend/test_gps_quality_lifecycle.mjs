import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyDealLocation, normalizeLocationPayload } from '../../src/utils/gpsQuality.js';
import { formatUrTruckLocationMessage, parseUrTruckLocationMessage } from '../../src/utils/chatLocation.js';

const now = Date.parse('2026-08-15T12:00:00.000Z');
const valid = normalizeLocationPayload({
  timestamp: now - 10_000,
  coords: { latitude: 43.2, longitude: 76.9, heading: 180, speed: 12, accuracy: 8 },
}, now);
assert.deepEqual(valid, {
  lat: 43.2, lng: 76.9, heading: 180, speed: 12, accuracy: 8,
  captured_at: '2026-08-15T11:59:50.000Z',
});
for (const coords of [
  { latitude: NaN, longitude: 76 }, { latitude: Infinity, longitude: 76 },
  { latitude: 91, longitude: 76 }, { latitude: 43, longitude: 181 },
]) assert.equal(normalizeLocationPayload({ coords }, now), null);

const sanitized = normalizeLocationPayload({
  timestamp: now,
  coords: { latitude: 43, longitude: 76, heading: 361, speed: 71, accuracy: -1 },
}, now);
assert.equal(sanitized.heading, null);
assert.equal(sanitized.speed, null);
assert.equal(sanitized.accuracy, null);

const liveResponse = {
  has_location: true, is_live: true, freshness: 'live', tracking_status: 'active',
  deal_status: 'in_progress', age_seconds: 30, location: { lat: 43.2, lng: 76.9 },
};
assert.equal(classifyDealLocation(liveResponse, now).isLive, true);
assert.equal(classifyDealLocation({ ...liveResponse, age_seconds: 181 }, now).isLive, false);
const terminal = classifyDealLocation({
  ...liveResponse, deal_status: 'awaiting_confirmation', freshness: 'stopped',
}, now);
assert.equal(terminal.isLive, false);
assert.equal(terminal.terminal, true);
assert.equal(terminal.freshness, 'stopped');

const read = (path) => fs.readFileSync(path, 'utf8');
const bg = read('src/utils/backgroundLocation.js');
const hook = read('src/hooks/useDealLocationBroadcast.js');
const track = read('src/screens/TrackTruckScreen.js');
const route = read('src/components/RouteMap.js');
const webMap = read('src/components/TruckMap.web.js');
const chat = read('src/screens/ChatScreen.js');
const chatLocation = read('src/utils/chatLocation.js');
const appJson = JSON.parse(read('app.json'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
const i18n = read('src/utils/i18n.js');

assert.match(bg, /Platform\.OS === 'web' \|\| Platform\.OS === 'android'/);
assert.match(bg, /mode: 'foreground_only'/);
assert.match(bg, /lastSentAt/);
assert.match(bg, /offline/);
assert.match(bg, /normalizeLocationPayload\(position\)/);
assert.match(hook, /return state/);
assert.match(hook, /await Promise\.all/);
assert.match(track, /classifyDealLocation/);
assert.match(track, /track_last_known/);
assert.match(route, /locationQuality\.isLive/);
assert.match(route, /hasPoint[\s\S]+track_last_known/);
assert.doesNotMatch(webMap, /roadOne|routeLine|startDot/);
assert.match(webMap, /track_coordinate_only/);
assert.doesNotMatch(webMap, /Linking|openURL|https?:\/\//);
assert.doesNotMatch(chat, /https:\/\/yandex\.ru\/maps\/\?pt=/);
assert.match(chat, /formatUrTruckLocationMessage\(t\('chat_location_msg'\), latitude, longitude\)/);
assert.doesNotMatch(chatLocation, /Linking|openURL|https?:\/\//);
const sharedLocation = formatUrTruckLocationMessage('Location', 43.2, 76.9);
assert.equal(sharedLocation, '📍 Location: 43.200000, 76.900000');
assert.deepEqual(parseUrTruckLocationMessage(sharedLocation), { latitude: 43.2, longitude: 76.9 });
for (const [latitude, longitude] of [[NaN, 76], [Infinity, 76], [91, 76], [43, 181]]) {
  assert.equal(formatUrTruckLocationMessage('Location', latitude, longitude), null);
}
assert.equal(appJson.expo.plugins.find((x) => Array.isArray(x) && x[0] === 'expo-location')[1].isAndroidBackgroundLocationEnabled, false);
assert.doesNotMatch(manifest, /ACCESS_BACKGROUND_LOCATION|FOREGROUND_SERVICE_LOCATION/);
for (const key of ['track_last_known', 'track_offline_title', 'track_offline', 'track_coordinate_only', 'track_location_unavailable', 'track_location_rejected']) {
  assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) || []).length, 4, `${key} RU/KK/ZH/EN parity`);
}

console.log('GPS quality/lifecycle client contract: PASS');
