import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const routeMap = fs.readFileSync('src/components/RouteMap.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const createCargo = fs.readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const createTrip = fs.readFileSync('src/screens/CreateTripScreen.js', 'utf8');
const picker = fs.readFileSync('src/components/RoutePointPicker.js', 'utf8');
const geography = fs.readFileSync('src/utils/geography.js', 'utf8');

test('route CTA opens a fullscreen map inside UrTruck and never deep-links externally', () => {
  assert.match(routeMap, /testID="route-map-bottom-action"/);
  assert.match(routeMap, /<Modal[\s\S]*testID="route-map-fullscreen-modal"/);
  assert.match(routeMap, /testID="route-map-fullscreen"/);
  assert.match(routeMap, /testID="route-map-fullscreen-close"/);
  assert.match(routeMap, /setRouteOpen\(true\)/);
  assert.doesNotMatch(routeMap, /Linking\.openURL/);
  assert.doesNotMatch(routeMap, /https:\/\/yandex\.(?:ru|kz)\/maps/);
  assert.doesNotMatch(nativeMap, /Linking\.openURL/);
  assert.doesNotMatch(webMap, /Linking\.openURL/);
  assert.doesNotMatch(nativeMap, /https:\/\/yandex\.(?:ru|kz)\/maps/);
  assert.doesNotMatch(webMap, /https:\/\/yandex\.(?:ru|kz)\/maps/);
  assert.match(nativeMap, /testID="truck-map-yandex-webview"/);
  assert.match(webMap, /testID="truck-map-yandex-web"/);
});

test('publish currency fields show one clear code, not duplicated symbol plus code', () => {
  assert.match(createCargo, /value=\{currency\}/);
  assert.match(createTrip, /value=\{currency\}/);
  assert.doesNotMatch(createCargo, /\{c\.l\} \{c\.k\}/);
  assert.doesNotMatch(createTrip, /\{c\.l\} \{c\.k\}/);
});

test('China-to-Kazakhstan border crossings are displayed in logistics direction', () => {
  assert.match(geography, /'Хоргос → Нур Жолы'/);
  assert.match(geography, /'Дулаты → Калжат'/);
  assert.match(picker, /'Хоргос → Нур Жолы'/);
  assert.doesNotMatch(picker, /'Нур Жолы ↔ Хоргос'/);
});