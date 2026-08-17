import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const mapSrc = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const injectSrc = fs.readFileSync('scripts/injectYandexMaps.mjs', 'utf8');
const chatSrc = fs.readFileSync('src/screens/ChatScreen.js', 'utf8');

test('Yandex map asks Router API for a real truck road route', () => {
  assert.match(mapSrc, /api\.route\(\{/);
  assert.match(mapSrc, /type: 'truck'/);
  assert.match(mapSrc, /DEFAULT_TRUCK/);
  assert.match(mapSrc, /toRoute\?\.\(\)/);
});

test('Router API key is supported by the production injector', () => {
  assert.match(injectSrc, /EXPO_PUBLIC_YANDEX_ROUTER_API_KEY/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_ROUTER_API_KEY__/);
  assert.match(injectSrc, /__URTRUCK_YANDEX_ROUTER_CONFIGURED__/);
});

test('deal chat delegates map rendering to fullscreen tracking without duplicate overlay', () => {
  assert.match(chatSrc, /testID="deal-track-truck"/);
  assert.match(chatSrc, /navigation\.navigate\('TrackTruck'/);
  assert.match(chatSrc, /onPress=\{openDealMap\}/);
  assert.doesNotMatch(chatSrc, /marketAPI\.getDealLocation\(dealId\)/);
  assert.doesNotMatch(chatSrc, /<TruckMap[\s\S]*routePoints=/);
});
