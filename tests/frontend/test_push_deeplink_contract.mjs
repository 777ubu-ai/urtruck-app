import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('App.js');
const push = read('src/utils/push.js');
const notifications = read('src/screens/NotificationsScreen.js');

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
