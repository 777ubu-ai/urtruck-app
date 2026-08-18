import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const geoSrc = fs.readFileSync('src/utils/geo.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');
const chatSrc = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');

test('Yandex map asks JS API 2.1 multirouter for a real driving road route', () => {
  assert.match(mapSrc, /api\.multiRouter\.MultiRoute/);
  assert.match(mapSrc, /referencePoints: routingPoints/);
  assert.match(mapSrc, /const routingPoints = livePoint && destination/);
  assert.match(mapSrc, /\? \[livePoint, destination\]/);
  assert.match(mapSrc, /: plannedPoints/);
  assert.match(mapSrc, /routingMode: 'auto'/);
  assert.match(mapSrc, /boundsAutoApply: true/);
  assert.match(mapSrc, /routeActiveStrokeColor: '#168759'/);
});

test('Bakhty-Tacheng checkpoint is routed from the Kazakhstan road anchor, not as a cross-border detour', () => {
  assert.match(geoSrc, /'Бахты': \[46\.679365, 82\.776816\]/);
  assert.match(geoSrc, /'Чугучак': \[46\.739131, 82\.983797\]/);
  assert.match(geoSrc, /isBakhtyTachengBorderPair/);
  assert.match(geoSrc, /return \[CITIES\['Бахты'\]\]/);
  assert.match(geoSrc, /Yandex MultiRoute/);
});

test('production injector uses the JavaScript API key without a paid Router API dependency', () => {
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(injectSrc, /api-maps\.yandex\.ru\/2\.1/);
  assert.doesNotMatch(injectSrc, /EXPO_PUBLIC_YANDEX_ROUTER_API_KEY|__URTRUCK_YANDEX_ROUTER_API_KEY__/);
});

test('deal chat delegates map rendering to fullscreen tracking without duplicate overlay', () => {
  assert.match(chatSrc, /testID="deal-track-truck"/);
  assert.match(chatSrc, /navigation\.navigate\('TrackTruck'/);
  assert.match(chatSrc, /onPress=\{openDealMap\}/);
  assert.doesNotMatch(chatSrc, /marketAPI\.getDealLocation\(dealId\)/);
  assert.doesNotMatch(chatSrc, /<TruckMap[\s\S]*routePoints=/);
});