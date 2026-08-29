// Owner-approved IA 30.08.2026: commercial events live in Deals, not Profile.
// Profile and its hamburger must not duplicate the same offer/deal counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const headerMenu = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
const bottomNav = readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const cargoDetail = readFileSync('src/screens/CargoDetail.js', 'utf8');

test('Profile does not duplicate notifications already surfaced in Deals', () => {
  assert.doesNotMatch(profile, /profile-notifications/);
  assert.doesNotMatch(profile, /menu_notifications/);
  assert.doesNotMatch(profile, /useUnreadNotifications/);
  assert.match(bottomNav, /route\.name === 'Deals' \? dealsUnread/);
});

test('hamburger is profile navigation only and has no notification counter logic', () => {
  assert.match(headerMenu, /navigation\.navigate\('Profile'/);
  assert.doesNotMatch(headerMenu, /useUnreadNotifications|notifUnread|dealsUnread|chatUnread/);
});

test('accepted deal detail keeps users inside UrTruck chat', () => {
  assert.match(cargoDetail, /testID="deal-order-chat"/);
  assert.doesNotMatch(cargoDetail, /deal-order-call|wa\.me|whatsapp|telegram|tg:\/\/|tel:/i);
  assert.equal(existsSync('src/utils/contactPartner.js'), false);
});
