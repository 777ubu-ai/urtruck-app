import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workspace = fs.readFileSync('src/screens/DealWorkspaceScreen.js', 'utf8');
const chatRouter = fs.readFileSync('src/screens/ChatScreenV2.js', 'utf8');
const tripRouter = fs.readFileSync('src/screens/TripDetailV2.js', 'utf8');
const cargoRouter = fs.readFileSync('src/screens/CargoDetailV2.js', 'utf8');
const nav = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const brand = fs.readFileSync('src/components/ui/v1/BrandBarWithShare.js', 'utf8');
const webMap = fs.readFileSync('src/components/TruckMap.web.js', 'utf8');

test('accepted deal chat is routed into the map-first workspace', () => {
  assert.match(nav, /import ChatScreenV2 from '\.\.\/screens\/ChatScreenV2'/);
  assert.match(nav, /name="Chat" component=\{ChatScreenV2\}/);
  assert.match(chatRouter, /room\?\.deal_id/);
  assert.match(chatRouter, /<DealWorkspaceScreen/);
  assert.match(chatRouter, /<ChatScreen/);
});

test('active cargo and trip details are routed into the same deal workspace', () => {
  assert.match(nav, /import CargoDetailV2 from '\.\.\/screens\/CargoDetailV2'/);
  assert.match(nav, /import TripDetailV2 from '\.\.\/screens\/TripDetailV2'/);
  assert.match(nav, /name="CargoDetail" component=\{CargoDetailV2\}/);
  assert.match(nav, /name="TripDetail" component=\{TripDetailV2\}/);
  assert.match(cargoRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(cargoRouter, /item\.cargo_id/);
  assert.match(cargoRouter, /<DealWorkspaceScreen/);
  assert.match(tripRouter, /ACTIVE\.has\(item\.status\)/);
  assert.match(tripRouter, /item\.trip_id/);
  assert.match(tripRouter, /<DealWorkspaceScreen/);
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
