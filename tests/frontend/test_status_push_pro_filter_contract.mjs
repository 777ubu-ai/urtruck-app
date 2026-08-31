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
const appBadge = fs.readFileSync('src/utils/appBadge.js', 'utf8');
const dealsScreen = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('foreground deal activity uses the Deals badge without a duplicate top banner', () => {
  assert.match(bottomNav, /computeDealsUnread/);
  assert.match(bottomNav, /setDealsUnread\(next\)/);
  assert.match(bottomNav, /syncAppIconBadge\(next\)/);
  assert.match(bottomNav, /bottom-nav-deals-badge/);
  assert.doesNotMatch(bottomNav, /useToast/);
  assert.doesNotMatch(bottomNav, /новое событие/);
  assert.doesNotMatch(bottomNav, /actionLabel:\s*t\('open_action'\)/);
});

test('archived deals never render unread badges and app icon badge uses active Deals attention only', () => {
  assert.match(dealsScreen, /const isArchived = ARCHIVE_DEAL_STATUSES\.has\(data\.status\)/);
  assert.match(dealsScreen, /const unread = isArchived \? 0 :/);
  assert.match(dealsScreen, /const unread = dealTab === 'archive' \|\| isClosed[\s\S]*\? 0[\s\S]*isBidActionable/);
  assert.match(appBadge, /computeDealsUnread\(dashboard\)/);
  assert.doesNotMatch(appBadge, /chatAPI\.unread\(/);
  assert.doesNotMatch(appBadge, /notificationsAPI\.unread\(/);
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
  assert.match(workspace, /headerIconBtn: \{/);
  assert.match(workspace, /backgroundColor: '#168759'/);
  assert.match(workspace, /statusActionIcon/);
  assert.match(workspace, /compactHeader:\s*\{\s*height:\s*118/);
});

test('status history opens from the status card and keeps the next status action at the bottom', () => {
  assert.match(workspace, /onPress=\{\(\) => setStatusModalOpen\(true\)\}/);
  assert.match(workspace, /<DealStatusTimeline events=\{timeline\} fallbackStatus=\{statusLabel\}/);
  assert.match(workspace, /statusNextBtn/);
  assert.match(workspace, /testID=\{nextActionTestId \|\| 'deal-status-next-action'\}/);
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
