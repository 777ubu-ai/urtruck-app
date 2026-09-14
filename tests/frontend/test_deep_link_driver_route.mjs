// Deep links P1 code closure (2026-09-14, Agent A).
//
// Root cause: ShareModal.js builds `${WEB_URL}/driver/{id}` for a shared
// driver profile (see `driverId` prop / `finalUrl` fallback), but neither
// App.js's push/universal-link router (parseNotifUrl/navigateFromUrl) nor
// its in-app twin in NotificationsScreen.js had a 'driver' branch — the
// link parsed fine (kind: 'driver', id) but silently fell through every
// `else if` and did nothing. Android's intentFilters and the iOS/web
// apple-app-site-association also never listed a /driver path, so even a
// browser/WhatsApp tap on that link could not hand off to the app at all.
//
// This file pins the fix for that gap, plus the other two deep-link P1
// closures reviewed alongside it: the pending-url auth-gate being generic
// (not push-only), and invalid/foreign ids failing into an explicit error
// state instead of a blank/broken card.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appJs = readFileSync('App.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');
const shareModal = readFileSync('src/components/ShareModal.js', 'utf8');
const appJson = JSON.parse(readFileSync('app.json', 'utf8'));
const aasa = JSON.parse(readFileSync('web/apple-app-site-association', 'utf8'));
const wellKnownAasa = JSON.parse(readFileSync('web/.well-known/apple-app-site-association', 'utf8'));
const cargoDetail = readFileSync('src/screens/CargoDetail.js', 'utf8');
const tripDetail = readFileSync('src/screens/TripDetail.js', 'utf8');
const dealWorkspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const chatApi = readFileSync('backend/api/chat.py', 'utf8');
const dealRoomApi = readFileSync('backend/api/deal_room.py', 'utf8');

test('ShareModal builds the /driver/{id} link this whole contract exists to close', () => {
  assert.match(shareModal, /`\$\{baseUrl\}\/driver\/\$\{driverId\}`/);
});

test('App.js: native push tap / universal-link router understands kind === "driver"', () => {
  const idx = appJs.indexOf("kind === 'driver' && id");
  assert.ok(idx > -1, "no 'driver' branch found in navigateFromUrl");
  const block = appJs.slice(idx, idx + 900);
  assert.match(block, /navigate\('DriverDetail', \{ driver: \{ id, _server: true, _isDriver: true \}, role \}\)/);
});

test('App.js: driver deep-links are queued behind the same pending-url auth gate as cargo/trip/deal/chat', () => {
  const needsAuthIdx = appJs.indexOf('const needsAuth =');
  assert.ok(needsAuthIdx > -1);
  const line = appJs.slice(needsAuthIdx, appJs.indexOf('\n', needsAuthIdx));
  for (const kind of ['cargos', 'trips', 'deals', 'chats', 'driver']) {
    assert.ok(line.includes(`'${kind}'`), `needsAuth list is missing '${kind}'`);
  }
});

test('NotificationsScreen.js: in-app notification-list tap has the same driver branch as the push router', () => {
  const idx = notifScreen.indexOf('kind === "driver" && id');
  assert.ok(idx > -1, "no 'driver' branch found in NotificationsScreen handlePress");
  const block = notifScreen.slice(idx, idx + 400);
  assert.match(block, /navigate\("DriverDetail", \{ driver: \{ id, _server: true, _isDriver: true \}, role \}\)/);
});

test('pending-url gate is a single generic funnel, not push-only: push taps, Linking events and getInitialURL all call the same routeFromUrl/pendingUrlRef pair', () => {
  // routeFromUrl is the one function that writes pendingUrlRef and checks
  // navReadyRef/authedForDeepLink. Every entrypoint below must call it
  // (directly or via the shared `handleResponse`/handler closures) rather
  // than reimplementing its own auth/ready check — otherwise a source that
  // bypasses it (e.g. a bare `navigateFromUrl(...)` call) would skip the
  // logged-out → login → return-to-target flow entirely.
  assert.match(appJs, /const routeFromUrl = \(url\) => \{/);
  assert.match(appJs, /pendingUrlRef\.current = url;/);
  // Native push tap (cold start + warm listener).
  assert.match(appJs, /const url = notificationResponseUrl\(response\);\s*\n\s*if \(url\) routeFromUrl\(url\);/);
  // Non-push app/universal links: Linking.getInitialURL + 'url' event.
  assert.match(appJs, /Linking\.getInitialURL\(\)\s*\n\s*\.then\(\(url\) => \{\s*\n\s*if \(active && url\) routeFromUrl\(url\);/);
  assert.match(appJs, /Linking\.addEventListener\('url', \(\{ url \}\) => \{\s*\n\s*if \(url\) routeFromUrl\(url\);/);
  // Web PWA service-worker notification postMessage.
  assert.match(appJs, /if \(event\.data\?\.type === 'notification' && event\.data\.url\) routeFromUrl\(event\.data\.url\);/);
  // The onReady flush (cold-start case where the container wasn't ready yet).
  assert.match(appJs, /onReady=\{\(\) => \{ navReadyRef\.current = true; if \(pendingUrlRef\.current\) routeFromUrl\(pendingUrlRef\.current\); \}\}/);
});

test('app.json: Android intentFilter carries a /driver universal-link entry alongside notifications/cargos/trips', () => {
  const data = appJson.expo.android.intentFilters[0].data;
  const prefixes = data.map((d) => d.pathPrefix);
  assert.ok(prefixes.includes('/driver'), `expected '/driver' in ${JSON.stringify(prefixes)}`);
  const driverEntry = data.find((d) => d.pathPrefix === '/driver');
  assert.equal(driverEntry.scheme, 'https');
  assert.equal(driverEntry.host, 'urtruck.kz');
});

test('iOS/web apple-app-site-association carries /driver/* and the two release copies stay identical', () => {
  const paths = aasa.applinks.details[0].paths;
  assert.ok(paths.includes('/driver/*'), `expected '/driver/*' in ${JSON.stringify(paths)}`);
  assert.deepEqual(aasa, wellKnownAasa);
});

test('CargoDetail.js: an unresolved deep-link cargo id renders an explicit not-found state, not a blank card', () => {
  assert.match(cargoDetail, /const \[cargoNotFound, setCargoNotFound\] = useState\(false\);/);
  assert.match(cargoDetail, /if \(cargoNotFound && !c\.from\) \{/);
  // The fetch-failure branch must only trip when this was a bare deep link
  // (no paramCargo.from carried by navigation) — never for a normal in-app
  // open where fullCargo simply hasn't refreshed yet.
  assert.match(cargoDetail, /else if \(!cargo\.from\) setCargoNotFound\(true\);/);
});

test('TripDetail.js: an unresolved deep-link trip id renders an explicit not-found state, not the empty placeholder', () => {
  assert.match(tripDetail, /const \[tripNotFound, setTripNotFound\] = React\.useState\(false\);/);
  assert.match(tripDetail, /if \(tripNotFound && !rawTrip\) \{/);
  assert.match(tripDetail, /else if \(!rawTrip\) setTripNotFound\(true\);/);
});

test('DealWorkspaceScreenV2.js: a foreign/invalid deal or chat-room deep-link id fails into an explicit state, not a blank chat shell', () => {
  assert.match(dealWorkspace, /const hadExplicitTargetRef = React\.useRef\(Boolean\(params\.dealId \|\| params\.roomId\)\);/);
  assert.match(dealWorkspace, /!dealId && hadExplicitTargetRef\.current \? \(/);
  assert.match(dealWorkspace, /testID="deal-chat-not-found"/);
  assert.match(dealWorkspace, /navigation\.navigate\('Deals', \{ role: params\.role \}\)/);
});

test('backend fails closed on a direct chat-room API call by a non-participant (403), and on an unknown room (404)', () => {
  // get_messages — the endpoint DealWorkspaceScreenV2 ultimately depends on
  // once it resolves a room id, whether reached via deep link or in-app.
  const idx = chatApi.indexOf('def get_messages');
  assert.ok(idx > -1);
  const block = chatApi.slice(idx, idx + 700);
  assert.match(block, /raise HTTPException\(status_code=404\)/);
  assert.match(block, /raise HTTPException\(status_code=403, detail="Вы не участник этого чата"\)/);
});

test('backend fails closed on the deal-room conversation/message endpoints for a non-participant, and on an unknown deal for user_can_access_deal', () => {
  assert.match(dealRoomApi, /if not dr\.is_participant\(conversation_id, user\["id"\]\):\s*\n\s*raise HTTPException\(status_code=403, detail="Вы не участник этой беседы"\)/);
  assert.match(dealRoomApi, /if not dr\.user_can_access_deal\(deal_id, user\["id"\]\):\s*\n\s*raise HTTPException\(status_code=403, detail="Нет доступа к этой сделке"\)/);
});
