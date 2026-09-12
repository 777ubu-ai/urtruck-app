import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cargoFeed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const card = fs.readFileSync('src/components/ui/v1/MarketplaceCard.js', 'utf8');
const bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');

test('cargo feed keeps the first screen dense enough for narrow mobile browsers', () => {
  assert.match(cargoFeed, /routeSelector:\s*\{[\s\S]*minHeight:\s*68/);
  assert.match(cargoFeed, /filtersScroll:\s*\{ flexGrow:\s*0,\s*minHeight:\s*50,\s*maxHeight:\s*50 \}/);
  assert.match(cargoFeed, /filterPill:\s*\{[\s\S]*height:\s*40/);
  // Unified Lists contract: a compact card has the common 108dp floor and
  // delegates shrink-safe endpoint layout to RouteLine (12/16 city type).
  assert.match(card, /card:\s*\{\s*padding:\s*12,\s*minHeight:\s*108/);
  const routeLine = fs.readFileSync('src/components/ui/v1/RouteLine.js', 'utf8');
  assert.match(routeLine, /fontSize:\s*12,\s*lineHeight:\s*16/);
  assert.doesNotMatch(card, /shadowOpacity/);
  // Price canon comes from v1Typography.price (17/22/800 tabular-nums).
  const designV1 = fs.readFileSync('src/theme/designV1.js', 'utf8');
  assert.match(designV1, /price:\s*\{\s*fontSize:\s*17,\s*lineHeight:\s*22,\s*fontWeight:\s*'800'/);
});

test('bottom navigation is compact but still keeps the four approved pages', () => {
  assert.match(bottomNav, /const PILL_H = 34/);
  assert.match(bottomNav, /const LABEL_H = 13/);
  assert.match(bottomNav, /const bottomPad = Math\.max\(insets\.bottom, 6\)/);
  // Design v1 Commit 2: tab label 10.5 → 11 (weight 700 kept, LABEL_H 13
  // unchanged — same line box, denser glyph).
  assert.match(bottomNav, /fontSize:\s*11/);
  assert.match(bottomNav, /Queue:\s*\{\s*driver:\s*'map-pin',\s*client:\s*'map-pin'\s*\}/);
  assert.doesNotMatch(bottomNav, /Profile:\s*\{/);
});
