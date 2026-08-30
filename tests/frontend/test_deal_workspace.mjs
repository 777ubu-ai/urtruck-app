import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const routeHost = fs.readFileSync('src/components/deal/DealWorkspaceRoute.js', 'utf8');
const actionResolver = fs.readFileSync('src/utils/dealActionResolver.js', 'utf8');
const chatRouter = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const tripRouter = fs.readFileSync('src/screens/TripDetailV2.js', 'utf8');
const cargoRouter = fs.readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const nav = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const brand = fs.readFileSync('src/components/ui/v1/BrandBarWithShare.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
const profileApi = fs.readFileSync('backend/api/profile.py', 'utf8');

test('accepted deal chat is routed into the canonical gated workspace', () => {
  assert.match(nav, /import ChatScreenV2 from '\.\.\/screens\/ChatScreenV2'/);
  assert.match(nav, /name="Chat" component=\{ChatScreenV2\}/);
  assert.match(chatRouter, /room\?\.deal_id/);
  assert.match(chatRouter, /import DealWorkspaceRoute from '\.\.\/components\/deal\/DealWorkspaceRoute'/);
  assert.match(chatRouter, /<DealWorkspaceRoute/);
  assert.doesNotMatch(chatRouter, /from '\.\/DealWorkspaceScreenV2'/);
  assert.match(routeHost, /DealLocationPermissionGate/);
  assert.match(routeHost, /DealWorkspaceScreenV2/);
  assert.match(chatRouter, /<ChatScreen/);
});

test('active cargo and trip details route into the same canonical gated workspace', () => {
  assert.match(nav, /import CargoDetailV2 from '\.\.\/screens\/CargoDetailV2'/);
  assert.match(nav, /import TripDetailV2 from '\.\.\/screens\/TripDetailV2'/);
  assert.match(nav, /name="CargoDetail" component=\{CargoDetailV2\}/);
  assert.match(nav, /name="TripDetail" component=\{TripDetailV2\}/);
  assert.match(cargoRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(cargoRouter, /import DealWorkspaceRoute from '\.\.\/components\/deal\/DealWorkspaceRoute'/);
  assert.match(cargoRouter, /<DealWorkspaceRoute/);
  assert.doesNotMatch(cargoRouter, /from '\.\/DealWorkspaceScreenV2'/);
  assert.match(tripRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(tripRouter, /import DealWorkspaceRoute from '\.\.\/components\/deal\/DealWorkspaceRoute'/);
  assert.match(tripRouter, /<DealWorkspaceRoute/);
  assert.doesNotMatch(tripRouter, /from '\.\/DealWorkspaceScreenV2'/);
});

test('deal workspace has fixed compact information header and no repeated UrTruck brand bar', () => {
  assert.match(workspace, /testID="deal-compact-header"/);
  assert.match(workspace, /testID="deal-workspace-back"/);
  assert.match(workspace, /cargoMeta/);
  assert.match(workspace, /scheduleMeta/);
  assert.match(workspace, /counterpartyMeta/);
  assert.doesNotMatch(workspace, /BrandBarWithShare|>UrTruck</);
  assert.doesNotMatch(brand, />UrTruck</);
  assert.match(brand, /compact-child-header/);
});

test('deal workspace is chat-first by default; the map is a deliberate, button-triggered secondary view', () => {
  // PR #255 QA pass (2026-08-20): the prior map-first design was reverted —
  // owner-confirmed "map-first бардак" must not come back. Chat renders
  // fullscreen by default; the map only appears after an explicit tap on the
  // "Карта рейса" card, and a visible control returns to chat from there.
  assert.match(workspace, /const VIEW_CHAT = 'chat'/);
  assert.match(workspace, /const VIEW_MAP = 'map'/);
  assert.match(workspace, /useState\(VIEW_CHAT\)/, 'chat must be the default view, not the map');
  assert.match(workspace, /testID="deal-chat-fullscreen"/);
  assert.match(workspace, /testID="deal-header-map"/);
  assert.doesNotMatch(workspace, /testID="deal-map-card-open"/);
  assert.match(workspace, /testID="deal-map-first-area"/);
  assert.match(workspace, /<TruckMap/);
  assert.match(workspace, /routePoints=\{routePoints\}/);
  assert.match(workspace, /onRouteSummary=\{onRouteSummary\}/);
  assert.match(workspace, /testID="deal-map-collapse"/);
  assert.match(workspace, /setViewMode\(VIEW_CHAT\)/, 'the map view must have a way back to chat');
  assert.doesNotMatch(workspace, /open_route_btn|Открыть маршрут|navigation\.navigate\('TrackTruck'/);
});

test('the map is never mounted underneath the chat — chat and map are mutually exclusive views', () => {
  // Isolate the chat-view JSX by its start/end testID markers rather than
  // trying to balance parens with regex (fragile — the branch itself
  // contains nested calls like Math.max(insets.bottom, 8)).
  const chatStart = workspace.indexOf('testID="deal-chat-fullscreen"');
  const mapStart = workspace.indexOf('testID="deal-map-fullscreen"');
  assert.ok(chatStart >= 0 && mapStart > chatStart, 'could not locate the chat-view then map-view markers in order');
  const chatBranch = workspace.slice(chatStart, mapStart);
  assert.doesNotMatch(chatBranch, /<TruckMap/, 'the live map component must not render while in chat view');
});

test('distance and ETA remain real Yandex route properties and fail closed', () => {
  assert.match(workspace, /testID="deal-route-metrics"/);
  assert.match(workspace, /routeSummary\.distanceText/);
  assert.match(workspace, /routeSummary\.durationText/);
  assert.match(workspace, /routeSummary\.isRemaining/);
  assert.match(webMap, /multiRoute\.getActiveRoute/);
  assert.match(webMap, /get\?\.\('distance'\)/);
  assert.match(webMap, /get\?\.\('duration'\)/);
  assert.match(webMap, /\[livePoint, destination\]/);
  assert.match(webMap, /emitSummary\(null\)/);
});

test('live map only exists for active working trip states', () => {
  assert.match(workspace, /const LIVE_TRACKING_STATUSES = \['in_progress', 'at_border'\]/);
  assert.match(workspace, /const MAP_WORK_STATUSES = \['accepted', 'in_progress', 'at_border'\]/);
  assert.match(workspace, /visibleDealStatus !== 'delivered'/);
  assert.match(workspace, /visibleDealStatus !== 'received'/);
  assert.match(workspace, /testID="deal-inactive-map-summary"/);
});

test('no draggable multi-state bottom sheet remains — chat is a plain fullscreen view', () => {
  // The old collapsed/expanded/full PanResponder sheet was the mechanism
  // that let the map crowd out the chat. It is gone, not hidden.
  assert.doesNotMatch(workspace, /PanResponder\.create/);
  assert.doesNotMatch(workspace, /sheetState/);
  assert.doesNotMatch(workspace, /setSheet\(/);
  assert.doesNotMatch(workspace, /keyboardWillShow|keyboardDidShow/);
});

test('chat has no permanent second tab — status/history lives behind one icon-triggered modal', () => {
  // PR #255 QA pass: "убрать лишние tabs, если чат уже fullscreen" — chat is
  // always fullscreen now, so a permanent Messages/Statuses tab row would be
  // exactly the redundant chrome the review flagged (it also used to render
  // "Сообщения" twice: once as the sheet title, once as the tab label).
  assert.doesNotMatch(workspace, /testID="deal-sheet-two-tabs"/);
  assert.doesNotMatch(workspace, /testID="deal-sheet-tab-/);
  assert.match(workspace, /testID="deal-status-open"/);
  assert.match(workspace, /testID="deal-status-panel"/);
  assert.match(workspace, /setStatusModalOpen\(true\)/);
});

test('composer grows then scrolls, switches mic to send, has a dedicated camera button, and uses a WhatsApp-like attachment menu', () => {
  assert.match(workspace, /multiline/);
  assert.match(workspace, /onContentSizeChange/);
  assert.match(workspace, /Math\.min\(112/);
  assert.match(workspace, /scrollEnabled=\{inputHeight >= 112\}/);
  assert.match(workspace, /testID="deal-chat-send"/);
  assert.match(workspace, /testID="deal-chat-voice"/);
  assert.match(workspace, /testID="deal-chat-camera"/);
  assert.match(workspace, /sendPhoto\(false\)/);
  assert.match(workspace, /sendPhoto\(true\)/);
  assert.match(workspace, /testID:\s*'deal-chat-attach-document'/);
  assert.match(workspace, /testID:\s*'deal-chat-attach-location'/);
  assert.doesNotMatch(workspace, /testID:\s*'deal-chat-attach-quick-reply'/);
  assert.doesNotMatch(workspace, /testID:\s*'deal-chat-attach-call'/);
  assert.match(workspace, /testID="deal-chat-attach-menu"/);
  assert.match(workspace, /PLUS_MENU\.map/, 'attach menu must render all tiles from one data-driven list, not hand-written copies');
  assert.match(workspace, /key: 'translate'/, 'deal chat must keep the translation shortcut from the legacy chat');
  // Section 3: Контакт/Каталог have no working logic yet and must not exist
  // as tiles at all (not even disabled) — a fake-active button is worse than
  // no button.
  assert.doesNotMatch(workspace, /attachContact|attachCatalog|ui\.contact\b|ui\.catalog\b/);
});

test('every plus-menu tile has a real handler — no decorative buttons', () => {
  const menuBlock = workspace.match(/const PLUS_MENU = \[([\s\S]*?)\];/);
  assert.ok(menuBlock, 'PLUS_MENU definition not found');
  const items = menuBlock[1];
  // Each tile object must carry an onPress that resolves to a real,
  // in-file function reference, not a no-op.
  const onPressMatches = [...items.matchAll(/onPress:\s*([^,}]+)/g)].map((m) => m[1].trim());
  assert.equal(onPressMatches.length, 5, `expected 5 plus-menu tiles with onPress, found ${onPressMatches.length}`);
  for (const handler of onPressMatches) {
    assert.notEqual(handler, '() => {}', `plus-menu tile has a no-op handler: ${handler}`);
    assert.notEqual(handler, 'null', `plus-menu tile has a null handler: ${handler}`);
  }
});

test('chat history scroll does not yank user from old messages when new messages arrive', () => {
  assert.match(workspace, /nearBottomRef/);
  assert.match(workspace, /setShowJumpLatest\(true\)/);
  assert.match(workspace, /testID="deal-chat-jump-latest"/);
  assert.match(workspace, /contentOffset/);
});

test('statuses render a detailed vertical timeline instead of compact system chips', () => {
  assert.match(workspace, /<DealStatusTimeline/);
  assert.match(workspace, /testID="deal-status-panel"/);
  assert.match(timeline, /testID="deal-status-timeline"/);
  assert.match(timeline, /location_name/);
  assert.match(timeline, /actor_name/);
  assert.match(timeline, /created_at/);
  assert.doesNotMatch(workspace, /<SystemEventRow/);
});

test('deal status actions use the shared canonical role FSM and GPS starts with trip', () => {
  assert.match(workspace, /getAvailableDealActions/);
  assert.match(actionResolver, /current === 'accepted'/);
  assert.match(actionResolver, /current === 'in_progress' && isInternational === true/);
  assert.match(actionResolver, /key: 'at_border'/);
  assert.match(actionResolver, /key: 'delivered'/);
  assert.match(actionResolver, /current === 'delivered'[\s\S]*key: 'received'/);
  assert.match(actionResolver, /current === 'received'[\s\S]*key: 'completed'/);
  assert.match(workspace, /ensureBackgroundLocationPermission/);
  assert.match(workspace, /marketAPI\.sendDealLocation/);
});

test('short onboarding requires name and phone for both roles and cannot skip', () => {
  assert.match(profile, /id="name"/);
  assert.match(profile, /id="phone"/);
  assert.match(profile, /id="company"/);
  assert.match(profile, /const formValid = validName && validPhone && validMessenger/);
  assert.match(profile, /if \(!validName\) next\.name/);
  assert.match(profile, /if \(!validPhone\) next\.phone/);
  assert.match(profile, /setRole\(role\)/);
  assert.doesNotMatch(profile, /id="country"/);
  assert.doesNotMatch(profile, /id="city"/);
  assert.match(profileApi, /PHONE_REQUIRED/);
  assert.match(profileApi, /NAME_REQUIRED/);
  assert.doesNotMatch(profileApi, /COUNTRY_REQUIRED/);
});
