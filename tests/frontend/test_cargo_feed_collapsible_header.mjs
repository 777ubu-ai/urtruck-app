import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
// Design v1 Commit 3: card chrome (density baselines included) moved into
// the canonical MarketplaceCard; the screen keeps only list spacing.
const card = fs.readFileSync('src/components/ui/v1/MarketplaceCard.js', 'utf8');

test('cargo feed removes heavy brand/title chrome and keeps only compact menu above list', () => {
  assert.match(src, /testID="cargo-feed-minimal-header"/);
  assert.match(src, /menuTestID="feed-menu-btn"/);
  assert.match(src, /topBar: \{[\s\S]*?minHeight: 48/);
  assert.doesNotMatch(src, /<Text style=\{styles\.brand\}>UrTruck<\/Text>/);
  assert.doesNotMatch(src, /styles\.titleRow/);
  assert.doesNotMatch(src, /testID="feed-view-toggle"/);
  assert.doesNotMatch(src, /LanguageSwitcher/);
});

test('route selector and filter chips stay compact and pinned above the cargo list', () => {
  assert.match(src, /const feedControls = \(/);
  assert.match(src, /ListHeaderComponent=\{feedControls\}/);
  assert.match(src, /testID="feed-route-selector"/);
  assert.match(src, /testID=\{`cargo-filter-\$\{key\}`\}/);
  assert.match(src, /filterPill\('date'/);
  assert.match(src, /filterPill\('body'/);
  assert.match(src, /filterPill\('price'/);
  assert.match(src, /testID="cargo-filter-favorites"/);
  assert.match(src, /stickyHeaderIndices=\{\[0\]\}/);
  assert.match(src, /ListHeaderComponentStyle=\{\{ backgroundColor: palette\.pageBg \}\}/);
  assert.equal((src.match(/<FlatList/g) || []).length, 1);
  assert.match(src, /cargo-feed-scroll-top/);
});

test('favorites quick filter runs against the complete server result and keeps bookmark state', () => {
  assert.match(src, /const \[savedOnly, setSavedOnly\] = useState\(false\)/);
  assert.match(src, /savedOnly,\s*limit:\s*50/);
  assert.match(src, /saved=\{savedOnly \|\| savedIds\.has\(String\(item\.id\)\)\}/);
  assert.match(src, /setSavedOnly\(\(value\) => !value\)/);
  assert.match(src, /accessibilityLabel=\{copy\.favorites\}/);
});

test('cargo feed bounds mounted rows without truncating loaded data or pagination', () => {
  assert.match(src, /const CARGO_FEED_WINDOW_SIZE = 7/);
  assert.match(src, /windowSize=\{CARGO_FEED_WINDOW_SIZE\}/);
  assert.match(src, /data=\{loading \? \[\] : visibleItems\}/);
  assert.match(src, /const visibleItems = items/);
  assert.doesNotMatch(src, /visibleItems\s*=\s*items\.(?:slice|splice)/);
  assert.match(src, /pageRef\.current\.nextOffset/);
});

test('cargo cards are dense without changing the controls above the list', () => {
  // The 84dp card is independent of the preserved route selector and filters.
  // A one-line 15/19 route remains beside the fixed price rail.
  const routeLine = fs.readFileSync('src/components/ui/v1/RouteLine.js', 'utf8');
  assert.match(routeLine, /fontSize:\s*15,\s*lineHeight:\s*19/);
  assert.match(card, /minHeight:\s*84/);
  assert.match(src, /cardSpacing: \{ marginHorizontal: 18, marginBottom: 7 \}/);
  assert.doesNotMatch(src, /cardExpanded/);
});
