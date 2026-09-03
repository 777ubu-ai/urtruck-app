import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('App.js', 'utf8');
const feed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const deals = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');
const bell = fs.readFileSync('src/components/ui/v1/NotificationBellButton.js', 'utf8');
const profile = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');
const nativeMap = fs.readFileSync('src/components/TruckMap.native.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const settingsGradle = fs.readFileSync('android/settings.gradle', 'utf8');

test('status bar follows the resolved app theme', () => {
  assert.match(app, /<StatusBar style=\{isDark \? 'light' : 'dark'\} backgroundColor=\{theme\.bg\}/);
  assert.doesNotMatch(app, /<StatusBar style="light" \/>/);
});

test('main headers expose notifications with the canonical attention counter', () => {
  assert.match(feed, /testID="feed-notification-bell-btn"/);
  assert.match(myTrips, /testID="mywork-notification-bell-btn"/);
  assert.match(deals, /testID="deals-notification-bell-btn"/);
  assert.match(bell, /notificationsAPI\.attention\(\)/);
  assert.match(bell, /total_attention/);
  assert.match(bell, /count > 0 \?/);
  assert.doesNotMatch(bell, /notificationsAPI\.unread\(\)/);
});

test('shipper machine cards render route country flags through the canonical helper', () => {
  assert.match(feed, /import \{ countryFlag \} from '\.\.\/utils\/countryFlags'/);
  assert.match(feed, /const fromFlag = countryFlag\(item\.fromCountry\)/);
  assert.match(feed, /const toFlag = countryFlag\(item\.toCountry\)/);
  assert.match(feed, /styles\.routeFlag/);
  assert.match(feed, /styles\.routePoint/);
});

test('profile theme picker keeps system mode as an explicit localized option', () => {
  assert.match(profile, /themeMode, setThemeMode/);
  assert.match(profile, /testID="theme-toggle-system"/);
  assert.match(profile, /setThemeMode\('auto'\)/);
  assert.match(i18n, /theme_system: 'Как на устройстве'/);
  assert.match(i18n, /theme_system: '跟随设备'/);
  assert.match(i18n, /theme_system: 'Match device'/);
});

test('route maps do not draw straight-line fallback routes when road geometry is unavailable', () => {
  assert.doesNotMatch(nativeMap, /roadGeometry\.length >= 2 \? roadGeometry : planned/);
  assert.match(nativeMap, /const road = roadGeometry\.length >= 2 \? roadGeometry : \[\]/);
  assert.doesNotMatch(webMap, /new api\.Polyline\(\s*routingPoints/);
  assert.doesNotMatch(webMap, /staticRouteLine/);
  assert.match(webMap, /truck-map-road-route-unavailable/);
});

test('android settings fails clearly when React Native dependencies are missing', () => {
  assert.match(settingsGradle, /\$\{label\} dependencies are missing\. Run npm ci first\./);
  assert.match(settingsGradle, /"React Native"/);
  assert.match(settingsGradle, /'Expo'/);
  assert.doesNotMatch(settingsGradle, /execute\(null, rootDir\)\.text\.trim\(\)/);
  assert.doesNotMatch(settingsGradle, /android\/null/);
});
