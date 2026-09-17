// Track: Claude harness fix, P1 (2026-09-08/09).
//
// Bell opens canonical push filters and owns the sole unread signal. The
// hamburger remains a profile/menu action, so counts cannot be duplicated or
// visually imply that menu settings are unread.
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

test('RootHeader owns the real unread badge on Bell, not the hamburger', () => {
  const root = readFileSync('src/components/ui/v1/RootHeader.js', 'utf8');
  const menu = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
  assert.match(root, /import \{ useUnreadNotifications \} from '..\/..\/..\/utils\/useUnreadNotifications'/);
  assert.match(root, /const unread = useUnreadNotifications\(hasToken, \{ includeChat: true \}\)/);
  assert.match(root, /<BellBadge onPress=\{onBellPress\} count=\{visibleBellCount\}/);
  assert.doesNotMatch(menu, /header-menu-unread-badge/);
  assert.doesNotMatch(menu, /useUnreadNotifications/);
});
