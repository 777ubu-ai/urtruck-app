import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/screens/DealWorkspaceScreen.js', 'utf8');
const router = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const nav = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const brand = fs.readFileSync('src/components/ui/v1/BrandBarWithShare.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');

test('accepted deal chat is routed into the map-first workspace', () => {
  assert.match(nav, /import ChatScreenV2 from '\.\.\/screens\/ChatScreenV2'/);
  assert.match(nav, /name="Chat" component=\{ChatScreenV2\}/);
  assert.match(router, /room\?\.deal_id/);
  assert.match(router, /<DealWorkspaceScreen/);
  assert.match(router, /<ChatScreen/);
});

test('deal workspace has compact header and no repeated UrTruck brand bar', () => {
  assert.match(workspace, /testID="deal-compact-header"/);
  assert.match(workspace, /testID="deal-workspace-back"/);
  assert.doesNotMatch(workspace, /BrandBarWithShare|>UrTruck</);
  assert.doesNotMatch(brand, />UrTruck</);
  assert.match(brand, /compact-child-header/);
});

test('deal workspace is map-first and embeds the route instead of an open-route CTA', () => {
  assert.match(workspace, /testID="deal-map-first-area"/);
  assert.match(workspace, /<TruckMap/);
  assert.match(workspace, /routePoints=\{routePoints\}/);
  assert.match(workspace, /onRouteSummary=\{onRouteSummary\}/);
  assert.doesNotMatch(workspace, /open_route_btn|Открыть маршрут|navigation\.navigate\('TrackTruck'/);
});

test('distance and ETA are real Yandex route properties and fail closed', () => {
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

test('chat sheet has collapsed expanded full states and keyboard expands it', () => {
  assert.match(workspace, /'collapsed'/);
  assert.match(workspace, /'expanded'/);
  assert.match(workspace, /'full'/);
  assert.match(workspace, /PanResponder\.create/);
  assert.match(workspace, /keyboardWillShow|keyboardDidShow/);
  assert.match(workspace, /setSheet\('full'\)/);
  assert.match(workspace, /testID=\{`deal-chat-sheet-\$\{sheetState\}`\}/);
});

test('composer grows, switches mic to send, and exposes photo camera document actions', () => {
  assert.match(workspace, /multiline/);
  assert.match(workspace, /onContentSizeChange/);
  assert.match(workspace, /Math\.min\(108/);
  assert.match(workspace, /testID="deal-chat-send"/);
  assert.match(workspace, /testID="deal-chat-voice"/);
  assert.match(workspace, /sendPhoto\(false\)/);
  assert.match(workspace, /sendPhoto\(true\)/);
  assert.match(workspace, /setSheetTab\('docs'\)/);
});

test('deal status actions preserve role FSM and GPS starts with trip', () => {
  assert.match(workspace, /deal\.status === 'accepted'.*in_progress/s);
  assert.match(workspace, /deal\.status === 'in_progress' && deal\.is_international === true.*at_border/s);
  assert.match(workspace, /deal\.status === 'in_progress' \|\| deal\.status === 'at_border'.*delivered/s);
  assert.match(workspace, /isShipper && deal\.status === 'delivered'.*completed/s);
  assert.match(workspace, /ensureBackgroundLocationPermission/);
  assert.match(workspace, /marketAPI\.sendDealLocation/);
});

test('workspace keeps documents and statuses in the expandable sheet', () => {
  assert.match(workspace, /testID="deal-documents-chip"/);
  assert.match(workspace, /testID="deal-statuses-chip"/);
  assert.match(workspace, /<DealAttachments/);
  assert.match(workspace, /<SystemEventRow/);
  assert.match(workspace, /testID="deal-status-panel"/);
});
