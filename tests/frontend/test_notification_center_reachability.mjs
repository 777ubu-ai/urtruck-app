import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');

test('Profile does not duplicate deal notifications entry or unread badge', () => {
  assert.doesNotMatch(profile, /screen: 'Notifications'/, 'Profile must not expose Notifications as a second deal hub');
  assert.doesNotMatch(profile, /testID: 'profile-notifications'/);
  assert.doesNotMatch(profile, /useUnreadNotifications/, 'Profile must not subscribe to deal unread counter');
  assert.doesNotMatch(profile, /profile-notifications-badge/);
});

test('NotificationsScreen still clears unread state correctly when reached by supported routing', () => {
  assert.match(notifScreen, /import \{ notifyNotifRead \} from '..\/utils\/unreadEvents'/);
  assert.match(notifScreen, /import \{ refreshAppIconBadge \} from '..\/utils\/appBadge'/);

  const markAll = notifScreen.slice(notifScreen.indexOf('const markAllRead'), notifScreen.indexOf('const markAllRead') + 600);
  assert.match(markAll, /notifyNotifRead\(\)/);
  assert.match(markAll, /refreshAppIconBadge\(\)/);

  const handlePress = notifScreen.slice(notifScreen.indexOf('const handlePress'), notifScreen.indexOf('const handlePress') + 700);
  assert.match(handlePress, /notifyNotifRead\(\)/);
  assert.match(handlePress, /refreshAppIconBadge\(\)/);
});

test('NotificationsScreen route remains registered for push/deep-link compatibility', () => {
  const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
  assert.match(nav, /name="Notifications"/);
  assert.match(nav, /component=\{NotificationsScreen\}/);
});
