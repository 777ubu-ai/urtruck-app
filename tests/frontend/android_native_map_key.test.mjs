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
  assert.match(map, /const DEFAULT_YANDEX_MAPS_JS_API_KEY = '.+'/);
  assert.match(map, /process\.env\.EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY \|\| DEFAULT_YANDEX_MAPS_JS_API_KEY/);
  assert.match(map, /window\.urtruckUpdateMap/);
  assert.match(map, /injectJavaScript/);
  assert.match(map, /testID="truck-map-yandex-webview"/);
  assert.match(map, /console\.error\('\[TruckMap\/Yandex\]'/);
});

test('P0-hotfix 28.08.2026 (§5): недоступность карты различает причину, не одно общее "error"', () => {
  // TestFlight build 17: "Карта недоступна" была ЕДИНСТВЕННЫМ состоянием для
  // (а) отсутствующего ключа на билд-тайме, (б) обрыва сети, (в) поломки
  // самого Yandex JS API, (г) отсутствия координат маршрута — владелец
  // прямо запретил оставлять общий текст без диагностики.
  const map = read('src/components/TruckMap.native.js');

  // Каждая причина — свой testID и свой mapStatus, не общий 'error'.
  assert.match(map, /testID="truck-map-native-unavailable-no_route_coordinates"/);
  assert.match(map, /testID=\{`truck-map-native-unavailable-\$\{mapStatus\}`\}/);
  assert.doesNotMatch(map, /setMapStatus\('error'\)/, "старое общее состояние 'error' не должно вернуться");

  assert.match(map, /'provider_not_configured'/);
  assert.match(map, /'network_error'/);
  assert.match(map, /'unknown_error'/);
  assert.match(map, /hasNothingToShow/);

  // В production — короткое понятное сообщение (i18n), в __DEV__ — ещё и
  // техническая причина.
  assert.match(map, /t\('map_no_route_coordinates'\)/);
  assert.match(map, /t\(mapStatus === 'network_error' \? 'map_network_error' : 'map_unavailable'\)/);
  assert.match(map, /__DEV__ \? <Text style=\{s\.mapDebugError\}>\{mapError\}<\/Text> : null/);
});

test('P0-hotfix 28.08.2026 (§2/§4): сломанный WebView размонтируется, а не прячется под текстом', () => {
  // Раньше при ошибке WebView оставался смонтированным ПОД fallback-текстом
  // (условие рендера зависело только от наличия ключа) — рабочая гипотеза:
  // его gesture recognizer мог перехватывать тачи поверх видимой кнопки
  // «Свернуть карту»/X (жалоба §4), и оставался живым native-компонентом
  // без причины при резких жестах (кандидат §2, не подтверждено device-логом).
  const map = read('src/components/TruckMap.native.js');

  assert.match(map, /const webViewMounted = !hasNothingToShow && !!YANDEX_MAPS_JS_API_KEY\s*\n\s*&& \(mapStatus === 'loading' \|\| mapStatus === 'ready'\);/);
  assert.match(map, /: webViewMounted \? <WebView/, 'WebView должен монтироваться только по webViewMounted, не по одному наличию ключа');
  assert.doesNotMatch(map, /: YANDEX_MAPS_JS_API_KEY \? <WebView/, 'старое условие (только по ключу) не должно вернуться');
});
