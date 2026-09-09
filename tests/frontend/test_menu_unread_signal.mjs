// Track: Claude harness fix, P1 (2026-09-08/09).
//
// Root cause: an earlier fix removed the lifecycle unread badge from Bell
// (correct — Bell now only opens notification settings) but, on Feed and
// MyWork specifically, ALSO swapped the ☰ menu button from
// HeaderMenuButton (which shows the same system/moderation/review unread
// count as a badge) down to a plain TouchableOpacity with no badge at all —
// Deals and Queue kept HeaderMenuButton. Result: a user with unread
// system/moderation/review notifications, sitting on Feed or MyWork (2 of
// the app's 4 permanent tabs), saw no in-app signal of it anywhere except
// the OS-level app icon badge, which is easy to miss or have disabled.
//
// Fix: not "put unread back on Bell" (Bell stays settings-only, per
// product decision) — instead, use the SAME HeaderMenuButton on Feed/
// CargoFeed/MyWork that Deals/Queue already use, restoring one consistent
// signal location across all four tabs. HeaderMenuButton.js's own
// docstring already documented this as the intended pattern for "всех
// основных вкладок (Лента, Мои рейсы, Очередь, Чаты, Сделки)" — Feed/
// MyWork had just drifted from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCREENS_WITH_MENU = [
  'src/screens/FeedScreen.js',
  'src/screens/CargoFeedScreen.js',
  'src/screens/MyTripsScreen.js',
  'src/screens/DealsScreen.js',
];

test('all four permanent tabs use the canonical RootHeader, not a bare menu icon', () => {
  for (const file of SCREENS_WITH_MENU) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /import RootHeader from '..\/components\/ui\/v1\/RootHeader'/, `${file}: missing RootHeader import`);
    assert.match(src, /<RootHeader\b/, `${file}: RootHeader must actually be rendered`);
  }
});

test('Bell stays settings-only — the unread signal moved to the menu button, not back onto Bell', () => {
  for (const file of SCREENS_WITH_MENU) {
    const src = readFileSync(file, 'utf8');
    // Bell's own onPress block must not read the unread hook — that would
    // reintroduce the old "Bell as unread inbox" pattern the product
    // explicitly moved away from.
    const bellIdx = src.search(/<RootHeader/);
    assert.ok(bellIdx > -1, `${file}: RootHeader not found`);
    const bellBlock = src.slice(bellIdx, bellIdx + 500);
    assert.doesNotMatch(bellBlock, /useUnreadNotifications|unread/, `${file}: Bell must not carry the unread signal again`);
  }
});

test('HeaderMenuButton itself renders a real badge, not a decorative dot, when there is unread', () => {
  const src = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
  assert.match(src, /import \{ useUnreadNotifications \} from "..\/..\/..\/utils\/useUnreadNotifications"/);
  assert.match(src, /const unread = useUnreadNotifications\(hasToken\)/);
  assert.match(src, /const visible = Number\(unread\) > 0/);
  assert.match(src, /testID="header-menu-unread-badge"/);
});
