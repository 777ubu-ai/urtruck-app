import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT_SCREENS = [
  'src/screens/FeedScreen.js',
  'src/screens/CargoFeedScreen.js',
  'src/screens/MyTripsScreen.js',
  'src/screens/DealsScreen.js',
];

test('all permanent tabs use canonical RootHeader', () => {
  for (const file of ROOT_SCREENS) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /import RootHeader from '..\/components\/ui\/v1\/RootHeader'/);
    assert.match(src, /<RootHeader\b/);
  }
});

test('RootHeader has no Bell/unread badge while hamburger remains profile-only', () => {
  const root = readFileSync('src/components/ui/v1/RootHeader.js', 'utf8');
  const menu = readFileSync('src/components/ui/v1/HeaderMenuButton.js', 'utf8');
  assert.doesNotMatch(root, /BellBadge|useUnreadNotifications|bell-unread-badge/);
  assert.match(root, /HeaderMenuButton/);
  assert.doesNotMatch(menu, /header-menu-unread-badge|useUnreadNotifications/);
});
