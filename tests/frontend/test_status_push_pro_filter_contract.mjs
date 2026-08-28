import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const toast = fs.readFileSync('src/components/Toast.js', 'utf8');
const bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const profile = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');
const feed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const locationPicker = fs.readFileSync('src/components/LocationPickerModal.js', 'utf8');
const i18n = fs.readFileSync('src/utils/i18n.js', 'utf8');
const push = fs.readFileSync('src/utils/push.js', 'utf8');

test('foreground deal notifications show a top banner with an open action', () => {
  assert.match(toast, /actionLabel:\s*options\?\.actionLabel/);
  assert.match(toast, /onAction:\s*typeof options\?\.onAction === 'function'/);
  assert.match(toast, /toast\.onAction\(\)/);
  assert.match(bottomNav, /dealsUnreadReadyRef/);
  assert.match(bottomNav, /next > prev/);
  assert.match(bottomNav, /toast\(`\$\{t\('tab_deals'\)\}: новое событие`/);
  assert.match(bottomNav, /actionLabel:\s*t\('open_action'\)/);
  assert.match(bottomNav, /navigation\.navigate\('Deals'/);
});

test('native push remains configured to show banners and play the default sound', () => {
  assert.match(push, /shouldShowBanner:\s*true/);
  assert.match(push, /shouldPlaySound:\s*true/);
  assert.match(push, /AndroidImportance\.MAX/);
  assert.match(push, /sound:\s*'default'/);
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
