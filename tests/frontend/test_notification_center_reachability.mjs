// P0-hotfix 28.08.2026 (TestFlight build 17 → 18), §1: push badge есть,
// in-app уведомлений нет.
//
// Первопричина: NotificationsScreen зарегистрирован в AppNavigator, но
// НИ ОДНА кнопка нигде в приложении на него не вела — единственный путь
// был deep-link url='/notifications', которого ни один backend push не
// отправляет. Сирота того же класса, что чинили в Этапе 6.4
// (HowItWorks/About) — но пропущенная. Backend-часть (создание записи для
// review/saved_search) покрыта backend/tests/test_notification_center_reachability.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync('src/screens/ProfileScreen.js', 'utf8');
const notifScreen = readFileSync('src/screens/NotificationsScreen.js', 'utf8');

test('Profile меню содержит реальную точку входа в Notifications', () => {
  assert.match(profile, /screen: 'Notifications'/, 'пункт меню должен вести на экран Notifications');
  assert.match(profile, /testID: 'profile-notifications'/);
  assert.match(profile, /t\('menu_notifications'\)/, 'должен использовать существующий (ранее мёртвый) i18n-ключ');
});

test('Profile меню показывает живой badge непрочитанных уведомлений', () => {
  assert.match(profile, /useUnreadNotifications/, 'ProfileScreen должен подписываться на unread-счётчик');
  assert.match(profile, /badge: notifUnread/);
  assert.match(profile, /item\.badge > 0/, 'badge рендерится только когда > 0');
  assert.match(profile, /testID="profile-notifications-badge"/);
});

test('NotificationsScreen мгновенно сбрасывает badge на Сделках и на иконке при чтении', () => {
  // Раньше badge обновлялся только на следующем 12-сек poll'е
  // (useUnreadNotifications) — пользователь читал уведомления, но иконка
  // и вкладка «Сделки» ещё несколько секунд показывали старую цифру.
  assert.match(notifScreen, /import \{ notifyNotifRead \} from '..\/utils\/unreadEvents'/);
  assert.match(notifScreen, /import \{ refreshAppIconBadge \} from '..\/utils\/appBadge'/);

  const markAll = notifScreen.slice(notifScreen.indexOf('const markAllRead'), notifScreen.indexOf('const markAllRead') + 600);
  assert.match(markAll, /notifyNotifRead\(\)/);
  assert.match(markAll, /refreshAppIconBadge\(\)/);

  const handlePress = notifScreen.slice(notifScreen.indexOf('const handlePress'), notifScreen.indexOf('const handlePress') + 700);
  assert.match(handlePress, /notifyNotifRead\(\)/);
  assert.match(handlePress, /refreshAppIconBadge\(\)/);
});

test('NotificationsScreen зарегистрирован в навигаторе (маршрут не удалён)', () => {
  const nav = readFileSync('src/navigation/AppNavigator.js', 'utf8');
  assert.match(nav, /name="Notifications"/);
  assert.match(nav, /component=\{NotificationsScreen\}/);
});
