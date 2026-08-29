// Owner-approved IA 30.08.2026: commercial events live in Deals, not Profile.
// NotificationsScreen stays registered for system/deep-link delivery, but the
// Profile menu must not duplicate deal/offer notifications or their badge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');
const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
const headerMenu = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
const bottomNav = readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const cargoDetail = readFileSync('src/screens/CargoDetail.js', 'utf8');

test('Profile does not duplicate notifications already surfaced in Deals', () => {
  assert.doesNotMatch(profile, /profile-notifications/);
  assert.doesNotMatch(profile, /menu_notifications/);
  assert.doesNotMatch(profile, /useUnreadNotifications/);
  assert.match(bottomNav, /route\.name === 'Deals' \? dealsUnread/);
});

test('hamburger is profile navigation only and has no notification badge', () => {
  assert.match(headerMenu, /navigation\.navigate\('Profile'/);
  assert.doesNotMatch(headerMenu, /useUnreadNotifications|unread|badge/i);
});

test('accepted deal detail keeps users inside UrTruck chat', () => {
  assert.match(cargoDetail, /testID="deal-order-chat"/);
  assert.doesNotMatch(cargoDetail, /deal-order-call|wa\.me|whatsapp|telegram|tg:\/\/|tel:/i);
  assert.equal(existsSync('src/utils/contactPartner.js'), false);
});

test('NotificationsScreen remains registered for system/deep-link delivery', () => {
  assert.match(nav, /name="Notifications"/);
  assert.match(nav, /component=\{NotificationsScreen\}/);
});

test('NotificationsScreen keeps read-state synchronization', () => {
  assert.match(notifScreen, /import \{ notifyNotifRead \} from '..\/utils\/unreadEvents'/);
  assert.match(notifScreen, /import \{ refreshAppIconBadge \} from '..\/utils\/appBadge'/);

  const markAll = notifScreen.slice(notifScreen.indexOf('const markAllRead'), notifScreen.indexOf('const markAllRead') + 600);
  assert.match(markAll, /notifyNotifRead\(\)/);
  assert.match(markAll, /refreshAppIconBadge\(\)/);

  const handlePress = notifScreen.slice(notifScreen.indexOf('const handlePress'), notifScreen.indexOf('const handlePress') + 700);
  assert.match(handlePress, /notifyNotifRead\(\)/);
  assert.match(handlePress, /refreshAppIconBadge\(\)/);
});
