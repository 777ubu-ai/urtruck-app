import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');

// Запрос владельца 09.10: полученный push должен находиться внутри приложения.
test('signed-in Profile menu exposes inbox without duplicating deal unread or clearing it', () => {
  assert.match(profile, /session\?\.user\?\.id \? \[/);
  assert.match(profile, /label: t\('menu_notifications'\), screen: 'Notifications', testID: 'profile-notifications'/);
  assert.doesNotMatch(profile, /notificationsAPI\.(?:read|readAll)\(/);
  assert.doesNotMatch(profile, /useUnreadNotifications/, 'Profile must not subscribe to deal unread counter');
  assert.doesNotMatch(profile, /profile-notifications-badge/);
  assert.doesNotMatch(profile, /profile-push-filter/);
  assert.doesNotMatch(profile, /navigation\.navigate\(['"]PushFilter/);
});

test('root screens retain approved headers and tabs; inbox is accessed through menu', () => {
  for (const file of [
    'src/screens/FeedScreen.js',
    'src/screens/CargoFeedScreen.js',
    'src/screens/MyTripsScreen.js',
    'src/screens/DealsScreen.js',
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /RootHeader/);
    assert.doesNotMatch(source, /deals-notification-inbox/, file);
    assert.doesNotMatch(source, /navigation\.navigate\('Notifications', \{ role \}\)/, file);
  }
});

test('NotificationsScreen still clears unread state correctly when reached by supported routing', () => {
  assert.match(notifScreen, /import \{ notifyNotifRead \} from '..\/utils\/unreadEvents'/);
  assert.match(notifScreen, /import \{ refreshAppIconBadge \} from '..\/utils\/appBadge'/);

  const markAll = notifScreen.slice(notifScreen.indexOf('const markAllRead'), notifScreen.indexOf('const handlePress'));
  assert.match(markAll, /notifyNotifRead\(\)/);
  assert.match(markAll, /refreshAppIconBadge\(\)/);

  const handlePress = notifScreen.slice(notifScreen.indexOf('const handlePress'), notifScreen.indexOf('const cleanNotifText'));
  assert.match(handlePress, /notifyNotifRead\(\)/);
  assert.match(handlePress, /refreshAppIconBadge\(\)/);
});

test('NotificationsScreen retains durable lifecycle entries for supported deep links', () => {
  assert.match(notifScreen, /setItems\(all\)/);
  assert.doesNotMatch(notifScreen, /isDealLifecycleNotification/);
});

test('NotificationsScreen route remains registered for push/deep-link compatibility', () => {
  const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
  assert.match(nav, /name="Notifications"/);
  assert.match(nav, /component=\{NotificationsScreen\}/);
  assert.match(nav, /<Stack\.Screen name="Notifications" component=\{NotificationsScreen\} \/>/);
});
