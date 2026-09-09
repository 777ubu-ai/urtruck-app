import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 2026-09-09 (Design v1 Commit 3): the canonical card family lives in
// MarketplaceCard.js; FeedCard.js is dead (0 importers, scheduled for
// deletion in Commit 8) and this contract now pins the new canon.
// 2026-08-19 history, still binding: owner-approved save action is a
// bookmark (Feather/FontAwesome5 icon), NEVER a heart emoji; price colour
// stays calm (no hardcoded orange text).
const card = fs.readFileSync('src/components/ui/v1/MarketplaceCard.js', 'utf8');
const shipperFeed = fs.readFileSync('src/screens/FeedScreen.js', 'utf8');
const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');

test('unified marketplace save action uses the approved bookmark icon and calm price colour', () => {
  assert.doesNotMatch(card, /❤️|🤍/); // Feather/FontAwesome5-иконка, не emoji
  assert.match(card, /name="bookmark"/);
  assert.doesNotMatch(card, /name="heart"/);
  // price colour comes from the theme token (`typo.price` → colors.text),
  // never a hardcoded orange hex.
  assert.doesNotMatch(card, /color: '#E06D00'/);
  assert.doesNotMatch(card, /color: '#FF8400'/);
});

test('shipper feed wires the bookmark with localized accessibility labels', () => {
  // MarketplaceCard receives the label from the caller — the trip feed
  // passes the canonical i18n keys.
  assert.match(shipperFeed, /accessibilityLabel: saved \? t\('in_favorites'\) : t\('add_to_favorites'\)/);
  assert.match(shipperFeed, /testID: `trip-card-bookmark-\$\{item\.id\}`/);
});

test('route owns primary row with Flag on both endpoints and a 2-line clamp', () => {
  // MyTrips route: Flag codes for both endpoints via the shared card
  // (legacy countryFlag emoji rendering is gone), 2-line clamp.
  assert.match(myTrips, /fromFlag: flagCodeOrNull\(item\.from_country\)/);
  assert.match(myTrips, /toFlag: flagCodeOrNull\(item\.to_country\)/);
  assert.match(card, /route\.numberOfLines \?\? 2/);
  assert.match(card, /<Flag code=\{fromFlag\} \/>/);
  assert.match(card, /<Flag code=\{toFlag\} \/>/);
});
