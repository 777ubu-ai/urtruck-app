import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('App.js');
const push = read('src/utils/push.js');
const notifications = read('src/screens/NotificationsScreen.js');
const appJson = JSON.parse(read('app.json'));
const aasa = JSON.parse(read('web/apple-app-site-association'));
const wellKnownAasa = JSON.parse(read('web/.well-known/apple-app-site-association'));
const assetlinks = JSON.parse(read('web/.well-known/assetlinks.json'));
const secureDeploy = read('.github/workflows/secure-production-deploy.yml');
const deployScript = read('deploy.sh');

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

test('notifications screen uses the same deep-link families as native push tap routing', () => {
  assert.match(notifications, /if \(kind === "cargos" && id\)/);
  assert.match(notifications, /navigation\.navigate\("CargoDetail", \{/);
  assert.match(notifications, /if \(kind === "trips" && id\)/);
  assert.match(notifications, /navigation\.navigate\("TripDetail", \{/);
  assert.match(notifications, /if \(kind === "deals" && id\)/);
  assert.match(notifications, /navigation\.navigate\("Chat", \{ dealId: id, role \}\)/);
  assert.match(notifications, /else if \(\(kind === "chats" \|\| kind === "chat"\) && id\)/);
  assert.match(notifications, /navigation\.navigate\("Chat", \{ roomId: id, role \}\)/);
});

test('foreground push suppression is source-of-truth aware for open chat rooms only', () => {
  assert.match(push, /data\.type === 'chat_message' \|\| data\.type === 'chat_attachment'/);
  assert.match(push, /data\.room_id === getActiveRoom\(\)/);
  assert.match(push, /shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false/);
  assert.match(push, /shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true/);
});

test('notification reads update both in-app source-of-truth and the app icon badge', () => {
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
  assert.match(notifications, /parsed\.protocol === "urtruck:" \|\| parsed\.protocol === "com\.urtruck\.app:"/);
});

test('native app listens to general url entrypoints in addition to push taps', () => {
  assert.match(app, /Linking\.getInitialURL\(\)/);
  assert.match(app, /Linking\.addEventListener\('url', \(\{ url \}\) =>/);
  assert.match(app, /if \(url\) routeFromUrlRef\.current\(url\);/);
});

test('P0 2026-09-03: Linking.getInitialURL() is consumed exactly once per process, not re-fetched on auth transitions', () => {
  // Root cause of the "cold start → Граница → спонтанный прыжок в чат
  // сделки" bug: getInitialURL() returns the SAME url on every call for
  // the process lifetime (RN/platform contract, it is not consumed by the
  // OS). The effect must run with [] deps so it fires exactly once; a ref
  // wrapper supplies the freshest routeFromUrl/authedForDeepLink closure
  // without re-triggering the effect (and therefore without re-fetching
  // getInitialURL) when auth state changes later in the session.
  assert.match(app, /const routeFromUrlRef = useRef\(routeFromUrl\);/);
  assert.match(app, /routeFromUrlRef\.current = routeFromUrl;/);
  const effectBlock = app.match(
    /Linking\.getInitialURL\(\)[\s\S]{0,600}?\n {2}\}, (\[[^\]]*\]\);)/,
  );
  assert.ok(effectBlock, 'getInitialURL effect not found');
  assert.equal(effectBlock[1], '[]);', 'getInitialURL effect must run exactly once ([] deps), not on every authedForDeepLink change');
});

test('ios and android release configs declare urtruck notifications app-link entrypoints', () => {
  assert.deepEqual(appJson.expo.ios.associatedDomains, ['applinks:urtruck.kz']);
  assert.equal(appJson.expo.android.intentFilters[0].data[0].scheme, 'https');
  assert.equal(appJson.expo.android.intentFilters[0].data[0].host, 'urtruck.kz');
  assert.equal(appJson.expo.android.intentFilters[0].data[0].pathPrefix, '/notifications');
});

test('release web bundle ships apple-app-site-association and assetlinks for notifications entrypoint', () => {
  const applePaths = aasa.applinks.details[0].paths;
  assert.ok(applePaths.includes('/notifications'));
  assert.ok(applePaths.includes('/notifications/*'));
  assert.deepEqual(aasa, wellKnownAasa);
  assert.equal(aasa.applinks.details[0].appID, 'ABR4N7KYY5.com.urtruck.app');
  assert.equal(assetlinks[0].target.package_name, 'com.urtruck.app');
  assert.match(assetlinks[0].target.sha256_cert_fingerprints[0], /^[A-F0-9:]{95}$/);
});

test('deploy paths keep .well-known release files instead of dropping hidden entries', () => {
  assert.match(secureDeploy, /scp -C -r dist\/\. "\$SERVER_USER@\$SERVER_HOST:\$REMOTE_DIR\/"/);
  assert.match(deployScript, /scp -i ~\/\.ssh\/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -r dist\/\. "\$\{SERVER\}:\$\{REMOTE_DIR\}\/"/);
  assert.match(deployScript, /scp -i ~\/\.ssh\/urtruck -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -r dist\/\. "\$\{SERVER\}:\$\{VERSIONS_DIR\}\/v\$NEW_VERSION\/"/);
});
