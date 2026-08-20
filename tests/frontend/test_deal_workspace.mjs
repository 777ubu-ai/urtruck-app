import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const actionResolver = fs.readFileSync('src/utils/dealActionResolver.js', 'utf8');
const chatRouter = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const tripRouter = fs.readFileSync('src/screens/TripDetailV2.js', 'utf8');
const cargoRouter = fs.readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const nav = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const brand = fs.readFileSync('src/components/ui/v1/BrandBarWithShare.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');
const attachments = fs.readFileSync('src/components/deal/DealAttachments.js', 'utf8');
const timeline = fs.readFileSync('src/components/deal/DealStatusTimeline.js', 'utf8');
const profile = fs.readFileSync('src/screens/registration/PremiumProfileScreen.js', 'utf8');
const profileApi = fs.readFileSync('backend/api/profile.py', 'utf8');

test('accepted deal chat is routed into the three-zone map-first workspace', () => {
  assert.match(nav, /import ChatScreenV2 from '\.\.\/screens\/ChatScreenV2'/);
  assert.match(nav, /name="Chat" component=\{ChatScreenV2\}/);
  assert.match(chatRouter, /room\?\.deal_id/);
  assert.match(chatRouter, /import DealWorkspaceScreen from '\.\/DealWorkspaceScreenV2'/);
  assert.match(chatRouter, /<DealWorkspaceScreen/);
  assert.match(chatRouter, /<ChatScreen/);
});

test('active cargo and trip details route into the same three-zone workspace', () => {
  assert.match(nav, /import CargoDetailV2 from '\.\.\/screens\/CargoDetailV2'/);
  assert.match(nav, /import TripDetailV2 from '\.\.\/screens\/TripDetailV2'/);
  assert.match(nav, /name="CargoDetail" component=\{CargoDetailV2\}/);
  assert.match(nav, /name="TripDetail" component=\{TripDetailV2\}/);
  assert.match(cargoRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(cargoRouter, /import DealWorkspaceScreen from '\.\/DealWorkspaceScreenV2'/);
  assert.match(cargoRouter, /<DealWorkspaceScreen/);
  assert.match(tripRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(tripRouter, /import DealWorkspaceScreen from '\.\/DealWorkspaceScreenV2'/);
  assert.match(tripRouter, /<DealWorkspaceScreen/);
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

test('deal workspace is map-first and has explicit map expand collapse control', () => {
  assert.match(workspace, /testID="deal-map-first-area"/);
  assert.match(workspace, /<TruckMap/);
  assert.match(workspace, /routePoints=\{routePoints\}/);
  assert.match(workspace, /onRouteSummary=\{onRouteSummary\}/);
  assert.match(workspace, /testID="deal-map-expand-toggle"/);
  assert.match(workspace, /setMapExpanded/);
  assert.doesNotMatch(workspace, /open_route_btn|Открыть маршрут|navigation\.navigate\('TrackTruck'/);
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

test('bottom sheet is vertical and supports collapsed expanded full states', () => {
  assert.match(workspace, /'collapsed'/);
  assert.match(workspace, /'expanded'/);
  assert.match(workspace, /'full'/);
  assert.match(workspace, /PanResponder\.create/);
  assert.match(workspace, /gesture\.dy/);
  assert.match(workspace, /keyboardWillShow|keyboardDidShow/);
  assert.match(workspace, /setSheet\('full'\)/);
  assert.match(workspace, /testID=\{`deal-chat-sheet-\$\{sheetState\}`\}/);
});

test('chat has exactly two permanent sheet tabs: messages and statuses', () => {
  assert.match(workspace, /testID="deal-sheet-two-tabs"/);
  assert.match(workspace, /\['chat', ui\.messages/);
  assert.match(workspace, /\['status', ui\.statuses/);
  assert.doesNotMatch(workspace, /deal-sheet-tab-docs|setSheetTab\('docs'\)/);
});

test('composer grows then scrolls, switches mic to send, and uses WhatsApp-like attachment menu', () => {
  assert.match(workspace, /multiline/);
  assert.match(workspace, /onContentSizeChange/);
  assert.match(workspace, /Math\.min\(112/);
  assert.match(workspace, /scrollEnabled=\{inputHeight >= 112\}/);
  assert.match(workspace, /testID="deal-chat-send"/);
  assert.match(workspace, /testID="deal-chat-voice"/);
  assert.match(workspace, /sendPhoto\(false\)/);
  assert.match(workspace, /sendPhoto\(true\)/);
  assert.match(workspace, /testID="deal-chat-attach-document"/);
  assert.match(workspace, /documentTrigger/);
  assert.match(attachments, /testID=\{inline \? 'deal-inline-attachments'/);
  assert.match(attachments, /documentTrigger/);
});

test('chat history scroll does not yank user from old messages when new messages arrive', () => {
  assert.match(workspace, /nearBottomRef/);
  assert.match(workspace, /setShowJumpLatest\(true\)/);
  assert.match(workspace, /testID="deal-chat-jump-latest"/);
  assert.match(workspace, /contentOffset/);
});

test('chat photos open in an app-controlled full screen viewer', () => {
  assert.match(workspace, /Modal/);
  assert.match(workspace, /photoViewer/);
  assert.match(workspace, /testID="deal-chat-photo-open"/);
  assert.match(workspace, /testID="deal-chat-photo-viewer"/);
  assert.match(workspace, /resizeMode="contain"/);
});

test('chat attachment menu uses the refreshed solid action styling', () => {
  assert.match(workspace, /justifyContent: 'space-around'/);
  assert.match(workspace, /width: 54, height: 54/);
  assert.match(workspace, /backgroundColor: '#E9F6EF'/);
  assert.match(workspace, /color="#168759"/);
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

test('shipper registration requires name country and phone and cannot skip', () => {
  assert.match(profile, /const isShipper = role === 'client'/);
  assert.match(profile, /prem-reg-profile-country/);
  assert.match(profile, /prem-reg-profile-phone/);
  assert.match(profile, /prem-reg-profile-company/);
  assert.match(profile, /const shipperReady = validName && validCountry && validPhone/);
  assert.match(profile, /!isShipper \? \(/);
  assert.match(profileApi, /COUNTRY_REQUIRED/);
  assert.match(profileApi, /PHONE_REQUIRED/);
  assert.match(profileApi, /NAME_REQUIRED/);
});
