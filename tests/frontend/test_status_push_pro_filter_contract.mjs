import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const profile = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');
const feed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const locationPicker = fs.readFileSync('src/components/LocationPickerModal.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');
const push = fs.readFileSync('src/utils/push.js', 'utf8');

test('foreground deal activity uses the Deals badge without a duplicate top banner', () => {
  assert.match(bottomNav, /computeDealsUnread/);
  assert.match(bottomNav, /setDealsUnread\(next\)/);
  assert.match(bottomNav, /bottom-nav-deals-badge/);
  assert.match(bottomNav, /route\.name === 'Deals' \? Math\.max\(chatUnread, dealsUnread\) : 0/);
  assert.doesNotMatch(bottomNav, /route\.name === 'Chats' \? chatUnread/);
  assert.doesNotMatch(bottomNav, /useToast/);
  assert.doesNotMatch(bottomNav, /новое событие/);
  assert.doesNotMatch(bottomNav, /actionLabel:\s*t\('open_action'\)/);
});

test('native push remains configured to show banners and play the default sound', () => {
  assert.match(push, /shouldShowBanner:\s*true/);
  assert.match(push, /shouldPlaySound:\s*true/);
  assert.match(push, /AndroidImportance\.MAX/);
  assert.match(push, /sound:\s*'default'/);
});

test('shipper machine feed saves an individual trip and exposes the same saved filter as driver cargo feed', () => {
  assert.match(feed, /favList\('trip'\)/);
  assert.match(feed, /favAdd\('trip', id/);
  assert.match(feed, /favRemove\('trip', id/);
  assert.match(feed, /testID="trip-filter-favorites"/);
  assert.match(feed, /savedIds\.has\(String\(item\.id\)\)/);
  assert.match(feed, /testID="trip-feed-minimal-header"/);
  assert.doesNotMatch(feed, /favList\('driver'\)/);
  assert.doesNotMatch(feed, /driverId \|\| item\.id/);
  assert.doesNotMatch(feed, /publish-cargo-button/);
  assert.doesNotMatch(feed, /<SearchBar/);
});

test('deal header uses map and status buttons, not the old call button', () => {
  assert.match(workspace, /testID="deal-header-map"/);
  assert.match(workspace, /testID="deal-status-open"/);
  assert.doesNotMatch(workspace, /testID="deal-header-call"/);
  assert.doesNotMatch(workspace, /testID="deal-map-card-open"/);
  assert.doesNotMatch(workspace, /testID="deal-status-compact-open"/);
  // Design v1 Commit 4: canonical chrome — 44dp, surface bg, hairline
  // border token (replaces the 32dp #F7F7F7/#202020 hardcoded fork).
  assert.match(workspace, /headerIconBtn: \{/);
  assert.match(workspace, /width: 44/);
  assert.match(workspace, /borderRadius: 22/);
  assert.match(workspace, /backgroundColor: colors\.surface, borderColor: colors\.border/);
  assert.match(workspace, /statusActionIcon/);
});

test('status history opens from the status card and keeps the next status action at the bottom', () => {
  assert.match(workspace, /onPress=\{\(\) => setStatusModalOpen\(true\)\}/);
  assert.match(workspace, /<DealStatusTimeline events=\{timeline\} fallbackStatus=\{statusLabel\}/);
  // Design v1 Commit 4: the next-action CTA is the canonical Button primary
  // (dealActionResolver labels/transitions untouched, testID contract kept).
  assert.match(workspace, /<Button/);
  assert.match(workspace, /testID=\{nextActionTestId \|\| 'deal-status-next-action'\}/);
  assert.match(workspace, /disabled=\{nextAction\.disabled \|\| statusLoading \|\| trackingLoading\}/);
  assert.doesNotMatch(workspace, /statusNextBtn/);
  assert.match(timeline, /const sortedEvents = \[\.\.\.events\]\.sort/);
  assert.match(timeline, /return eventTime\(b\) - eventTime\(a\)/);
  assert.match(timeline, /currentCard/);
});

test('profile PRO state is explicit and no longer depends on a bare percent label', () => {
  assert.match(profile, /proStatusTitle = proActive \? t\('pro_active_badge'\) : t\('pro_inactive_badge'\)/);
  assert.match(profile, /verificationStatusText = profile\.is_verified \? t\('verification_passed_short'\) : t\('verification_failed_short'\)/);
  assert.match(profile, /proStatusBadge/);
  assert.doesNotMatch(profile, /<Text style=\{\[s\.proPercent/);
  assert.match(i18n, /pro_inactive_badge:\s*'PRO не активен'/);
  assert.match(i18n, /verification_passed_short:\s*'Проверка пройдена'/);
});

test('route filter can select a whole country without forcing a city', () => {
  assert.match(feed, /dirFromCountry/);
  assert.match(feed, /dirToCountry/);
  assert.match(feed, /allowCountryOnly/);
  assert.match(feed, /countryOnly \? ''/);
  assert.match(feed, /fromCountry === dirFromCountry/);
  assert.match(feed, /toCountry === dirToCountry/);
  assert.match(locationPicker, /allowCountryOnly = false/);
  assert.match(locationPicker, /type:\s*'country'/);
  assert.match(locationPicker, /testID=\{`loc-country-only-\$\{country\}`\}/);
  assert.match(i18n, /loc_whole_country:\s*'Вся страна'/);
});

test('shared route picker searches countries and separates country, city, and border scopes', () => {
  assert.match(locationPicker, /const \[scope, setScope\] = useState\('all'\)/);
  assert.match(locationPicker, /countryHits/);
  assert.match(locationPicker, /\['country', t\('loc_countries'\)\]/);
  assert.match(locationPicker, /\['city', t\('point_type_city'\)\]/);
  assert.match(locationPicker, /\['border', t\('loc_borders'\)\]/);
  assert.match(locationPicker, /testID=\{`loc-scope-\$\{key\}`\}/);
  assert.match(locationPicker, /hits\.countryHits\.length === 0 && hits\.pointHits\.length === 0/);
});

// Push/Outbox/Localization repair (2026-09-11): push_devices.locale was
// only ever captured once, at push.autoRegister() (OTP/login) — a user
// who later switched the in-app language kept receiving system push text
// in whatever language was active at login for the rest of that session.
// setLanguage() must refresh it on every language switch, and the
// refresh itself must never touch native permission APIs (that would
// re-prompt a user who had previously denied notifications, as an
// unexpected side effect of switching UI language).
test('language switch refreshes the backend push locale without re-touching native permissions', () => {
  assert.match(i18n, /require\('\.\/push'\)\.push\.refreshLocale\?\.\(\)/);
  assert.match(push, /async refreshLocale\(\)/);
  const refreshLocaleBody = push.slice(push.indexOf('async refreshLocale()'), push.indexOf('// ── Единый автозапуск'));
  assert.doesNotMatch(refreshLocaleBody, /getPermissionsAsync/);
  assert.doesNotMatch(refreshLocaleBody, /requestPermissionsAsync/);
  assert.match(refreshLocaleBody, /NATIVE_TOKEN_KEY/);
  assert.match(refreshLocaleBody, /NATIVE_RAW_TOKEN_KEY/);
  assert.match(refreshLocaleBody, /register-native/);
});
