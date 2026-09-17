import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT_SCREENS = [
  'src/screens/FeedScreen.js',
  'src/screens/CargoFeedScreen.js',
  'src/screens/MyTripsScreen.js',
  'src/screens/DealsScreen.js',
  'src/screens/QueueScreenLazyV2.js',
];

const read = (file) => readFileSync(file, 'utf8');

const loadTranslations = () => {
  const source = read('src/utils/i18n.js');
  const match = source.match(/const translations = (\{[\s\S]*?\n\};)/);
  assert.ok(match, 'i18n translations object must be readable');
  // Matches the established i18n smoke parser. The object is static source
  // data, and this keeps the Bell regression independent from React Native.
  // eslint-disable-next-line no-eval
  return eval(`(${match[1].slice(0, -1)})`);
};

test('Bell always routes authenticated root screens to PushFilter', () => {
  for (const file of ROOT_SCREENS) {
    const source = read(file);
    assert.match(source, /onBellPress=\{async \(\) => \{/,
      `${file}: RootHeader must own Bell navigation`);
    assert.match(source, /requireLevel\(LEVELS\.PHONE, 'push_settings', role\)/,
      `${file}: Bell must preserve the phone-level gate`);
    assert.match(source, /if \(ok\) navigation\.navigate\('PushFilter', \{ role \}\)/,
      `${file}: Bell must enter PushFilter after the gate`);
    assert.doesNotMatch(source, /onBellPress=[\s\S]{0,300}navigation\.navigate\('Notifications'/,
      `${file}: Bell must not reopen the legacy notification center`);
  }
});

test('PushFilter remains route and vehicle based push settings, not a Bell inbox', () => {
  const navigator = read('src/navigation/AppNavigator.js');
  const screen = read('src/screens/PushFilterScreen.js');

  assert.match(navigator, /name="PushFilter" component=\{PushFilterScreen\}/);
  assert.match(screen, /getPushSettings/);
  assert.match(screen, /setPushSettings/);
  assert.match(screen, /listSavedRoutes/);
  assert.match(screen, /saveRoute/);
  assert.match(screen, /TRUCK_KEYS/);
  assert.doesNotMatch(screen, /NotificationsScreen|ChatsListScreen|DealsScreen/);
});

test('PushFilter itself never returns a user to the legacy Bell feed', () => {
  const screen = read('src/screens/PushFilterScreen.js');
  assert.match(screen, /testID="push-filter-back"/);
  assert.match(screen, /navigation\.goBack\(\)/);
  assert.doesNotMatch(screen, /BellBadge|HeaderMenuButton|navigate\('Notifications'/);
});

test('PushFilter critical copy exists in RU, EN, KK, and ZH', () => {
  const translations = loadTranslations();
  const keys = [
    'push_title', 'push_categories', 'push_filter_cargos',
    'push_only_my_routes', 'route_direction', 'from', 'to',
    'push_route_driver_hint', 'push_route_shipper_hint',
    'push_min_tons', 'push_min_price', 'push_truck_types',
    'saved_routes', 'saved_routes_empty', 'push_any_cargo',
    'push_save_btn', 'push_saved', 'send_error', 'delete',
  ];

  for (const locale of ['RU', 'EN', 'KK', 'ZH']) {
    for (const key of keys) {
      assert.equal(typeof translations[locale]?.[key], 'string',
        `${locale}.${key} must localize PushFilter`);
    }
  }
});
