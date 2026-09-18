import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const flag = read('src/components/ui/v1/CountryFlag.js');
const route = read('src/components/ui/v1/RouteLine.js');

test('CountryFlag has local KZ artwork and an ISO-code unknown badge', () => {
  assert.match(flag, /KZ_APPROVED_XML/);
  assert.match(flag, /<circle/);
  assert.match(flag, /stroke="#F6C744"/);
  assert.match(flag, /const unknownCode = normalized \|\| '--'/);
  assert.doesNotMatch(flag, />\?</);
  assert.doesNotMatch(flag, /https:\/\//);
  assert.match(read('src/screens/DesignPreviewScreen.js'), /CountryFlag code="XX"/);
});

test('compact RouteLine renders real rectangular flags at 28x18 without round crop', () => {
  assert.match(route, /width=\{compact \? 28/);
  assert.match(route, /height=\{compact \? 18/);
  assert.match(route, /compact=\{compact\}/);
  assert.match(route, /compactFlag: \{ marginRight: 4, borderRadius: 5 \}/);
  assert.match(route, /compactCity: \{ fontSize: 12, lineHeight: 16 \}/);
});

test('all requested P0 screens use the shared flag path and contain no emoji/globe flag fallback', () => {
  const screens = [
    'src/screens/WalletScreen.js',
    'src/screens/QueueScreenLazyV2.js',
    'src/screens/registration/CitizenshipScreen.js',
    'src/screens/DealsScreen.js',
    'src/screens/CargoFeedScreen.js',
    'src/screens/MyTripsScreen.js',
    'src/screens/DriverDetail.js',
    'src/screens/CargoDetail.js',
  ];
  const combined = screens.map(read).join('\n');
  assert.doesNotMatch(combined, /🌐|🏳️|🇰🇿|🇨🇳|🇷🇺|🇺🇿|🇰🇬|🇹🇯|🇹🇷/);
  assert.doesNotMatch(read('src/screens/QueueScreenLazyV2.js'), /🌐/);
  assert.match(read('src/screens/DriverDetail.js'), /<CountryFlag/);
  assert.match(read('src/screens/CargoDetail.js'), /<CountryFlag/);
  assert.match(read('src/screens/WalletScreen.js'), /<CountryFlag/);
  assert.match(read('src/screens/registration/CitizenshipScreen.js'), /<CountryFlag/);
});

test('Deals uses the real compact MarketplaceCard render branch for every deal card', () => {
  const deals = read('src/screens/DealsScreen.js');
  const card = read('src/components/ui/v1/MarketplaceCard.js');
  assert.match(deals, /<MarketplaceCard[\s\S]*compact/);
  assert.match(card, /style=\{\[compact \? s\.compactCard/);
  assert.match(card, /compactCard: \{[\s\S]*minHeight: 74/);
  assert.match(card, /compact && firstMeta \? <Text style=\{\[s\.compactMeta/);
  assert.match(card, /body \|\| status \|\| rightMeta \|\| bookmark \|\| unread > 0 \|\| \(compact && firstMeta\)/);
});

test('BottomNav is the approved borderless 70pt floating capsule', () => {
  const nav = read('src/components/ui/v1/BottomNav.js');
  assert.match(nav, /height: 70, minHeight: 70/);
  assert.match(nav, /borderRadius: 30, borderWidth: 0/);
});
