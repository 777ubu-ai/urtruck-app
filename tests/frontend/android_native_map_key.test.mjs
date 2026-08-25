import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Android uses Yandex JS API in WebView without Google MapView configuration', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const workflow = read('.github/workflows/deploy-play.yml');
  const map = read('src/components/TruckMap.native.js');

  assert.doesNotMatch(manifest, /com\.google\.android\.geo\.API_KEY/);
  assert.match(workflow, /EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY: \$\{\{ secrets\.YANDEX_MAPS_JS_API_KEY \}\}/);
  assert.match(map, /from 'react-native-webview'/);
  assert.match(map, /api-maps\.yandex\.ru\/2\.1/);
  assert.match(map, /baseUrl: 'https:\/\/urtruck\.kz'/);
});

test('native Yandex map updates geo objects without recreating WebView', () => {
  const map = read('src/components/TruckMap.native.js');

  assert.match(map, /process\.env\.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY/);
  assert.match(map, /window\.urtruckUpdateMap/);
  assert.match(map, /injectJavaScript/);
  assert.match(map, /testID="truck-map-yandex-webview"/);
  assert.match(map, /testID="truck-map-native-unavailable"/);
  assert.match(map, /console\.error\('\[TruckMap\/Yandex\]'/);
});
