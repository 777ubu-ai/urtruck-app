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
  assert.doesNotMatch(profile, /profile-push-filter/);
  assert.doesNotMatch(profile, /navigation\.navigate\(['"]PushFilter/);
});

test('My Work Bell opens the canonical notification center', () => {
  const myTrips = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
  assert.match(myTrips, /bellTestID="mywork-notification-settings-btn"/);
  assert.match(myTrips, /navigation\.navigate\('Notifications', \{ role \}\)/);
  assert.doesNotMatch(myTrips, /navigation\.navigate\(['"]PushFilter/);
});

test('all active root feeds route Bell to the canonical notification center', () => {
  for (const file of ['src/screens/FeedScreen.js', 'src/screens/CargoFeedScreen.js', 'src/screens/DealsScreen.js']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /RootHeader/);
    assert.match(source, /navigation\.navigate\('Notifications', \{ role \}\)/, file);
    assert.doesNotMatch(source, /useUnreadNotifications/);
    assert.doesNotMatch(source, /navigation\.navigate\(['"]PushFilter/, file);
  }
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

test('NotificationsScreen retains durable lifecycle entries for the Bell inbox', () => {
  assert.match(notifScreen, /setItems\(all\)/);
  assert.doesNotMatch(notifScreen, /isDealLifecycleNotification/);
});

test('NotificationsScreen route remains registered for push/deep-link compatibility', () => {
  const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
  assert.match(nav, /name="Notifications"/);
  assert.match(nav, /component=\{NotificationsScreen\}/);
});
