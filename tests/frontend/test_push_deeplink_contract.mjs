import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('App.js');
const push = read('src/utils/push.js');
const appJson = JSON.parse(read('app.json'));
const iosEntitlements = read('ios/UrTruck/UrTruck.entitlements');
const aasa = JSON.parse(read('web/apple-app-site-association'));
const wellKnownAasa = JSON.parse(read('web/.well-known/apple-app-site-association'));
const assetlinks = JSON.parse(read('web/.well-known/assetlinks.json'));

test('native push tap routing keeps canonical deep-links for cargo, trip, deal, chat, profile and notifications', () => {
  assert.match(app, /if \(kind === 'cargos' && id\)/);
  assert.match(app, /navigate\('CargoDetail', \{ cargoId: id, bidId: params\.bid \|\| null, role \}\)/);
  assert.match(app, /if \(kind === 'trips' && id\)/);
  assert.match(app, /navigate\('TripDetail', \{ tripId: id, bidId: params\.bid \|\| null, role \}\)/);
  assert.match(app, /if \(kind === 'deals' && id\)/);
  assert.match(app, /navigate\('Chat', \{ dealId: id, role \}\)/);
  assert.match(app, /if \(kind === 'chats' && id\)/);
  assert.match(app, /navigate\('Chat', \{ roomId: id, role \}\)/);
  assert.match(app, /else if \(kind === 'profile'\)/);
  assert.match(app, /navigate\('Profile'\)/);
  assert.match(app, /else if \(kind === 'notifications'\)/);
  assert.match(app, /navigate\('Notifications'\)/);
});

test('foreground push suppression is source-of-truth aware for open chat rooms only', () => {
  assert.match(push, /data\.type === 'chat_message' \|\| data\.type === 'chat_attachment'/);
  assert.match(push, /data\.room_id === getActiveRoom\(\)/);
  assert.match(push, /shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false/);
  assert.match(push, /shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true/);
});

test('notification reads update both in-app source-of-truth and the app icon badge', () => {
  const notifications = read('src/screens/NotificationsScreen.js');
  assert.match(notifications, /await notificationsAPI\.readAll\(\);/);
  assert.match(notifications, /notifyNotifRead\(\);/);
  assert.match(notifications, /refreshAppIconBadge\(\);/);
  assert.match(notifications, /await notificationsAPI\.read\(item\.id\);/);
});

test('auth and notification cold-start deeplinks are queued until nav and auth are ready', () => {
  assert.match(app, /pendingUrlRef\.current = url/);
  assert.match(app, /if \(pendingUrlRef\.current && navReadyRef\.current && authedForDeepLink\)/);
  assert.match(app, /Notifications\.getLastNotificationResponseAsync/);
  assert.match(app, /Notifications\.addNotificationResponseReceivedListener/);
});

test('custom-scheme and universal-link notification entrypoints are parsed as Notifications', () => {
  assert.match(app, /parsed\.protocol === 'urtruck:' \|\| parsed\.protocol === 'com\.urtruck\.app:'/);
  assert.match(app, /const hostPart = parsed\.hostname \? `\/\$\{parsed\.hostname\}` : ''/);
  assert.match(app, /else if \(kind === 'notifications'\)/);
  assert.match(app, /navigate\('Notifications'\)/);
});

test('native app listens to general url entrypoints in addition to push taps', () => {
  assert.match(app, /Linking\.getInitialURL\(\)/);
  assert.match(app, /Linking\.addEventListener\('url', \(\{ url \}\) =>/);
  assert.match(app, /if \(url\) routeFromUrl\(url\);/);
});

test('ios TestFlight config keeps push deeplinks buildable until Associated Domains is enabled in Apple profile', () => {
  assert.equal(appJson.expo.ios.associatedDomains, undefined);
  assert.doesNotMatch(iosEntitlements, /com\.apple\.developer\.associated-domains/);
  assert.match(iosEntitlements, /<key>aps-environment<\/key>\s*<string>production<\/string>/);
});

test('android release config declares urtruck notifications app-link entrypoint', () => {
  assert.equal(appJson.expo.android.intentFilters[0].data[0].scheme, 'https');
  assert.equal(appJson.expo.android.intentFilters[0].data[0].host, 'urtruck.kz');
  assert.equal(appJson.expo.android.intentFilters[0].data[0].pathPrefix, '/notifications');
});

test('release metadata files declare notifications universal-link ownership for web/android and future iOS capability enablement', () => {
  const applePaths = aasa.applinks.details[0].paths;
  assert.ok(applePaths.includes('/notifications'));
  assert.ok(applePaths.includes('/notifications/*'));
  assert.deepEqual(aasa, wellKnownAasa);
  assert.equal(aasa.applinks.details[0].appID, 'ABR4N7KYY5.com.urtruck.app');
  assert.equal(assetlinks[0].target.package_name, 'com.urtruck.app');
  assert.match(assetlinks[0].target.sha256_cert_fingerprints[0], /^[A-F0-9:]{95}$/);
});
