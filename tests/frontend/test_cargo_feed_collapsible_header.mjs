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

test('route selector and all filter chips scroll away with cargo list like a messenger large header', () => {
  assert.match(src, /const feedControls = \(/);
  assert.match(src, /ListHeaderComponent=\{feedControls\}/);
  assert.match(src, /testID="feed-route-selector"/);
  assert.match(src, /testID=\{`cargo-filter-\$\{key\}`\}/);
  assert.match(src, /filterPill\('date'/);
  assert.match(src, /filterPill\('body'/);
  assert.match(src, /filterPill\('price'/);
  assert.match(src, /testID="cargo-filter-favorites"/);
  assert.doesNotMatch(src, /stickyHeaderIndices/);
  assert.doesNotMatch(src, /position:\s*['"]sticky['"]/);
});

test('favorites quick filter uses the same saved cargo ids as card bookmarks', () => {
  assert.match(src, /const \[savedOnly, setSavedOnly\] = useState\(false\)/);
  assert.match(src, /savedOnly && !savedIds\.has\(String\(item\.id\)\)/);
  assert.match(src, /setSavedOnly\(\(value\) => !value\)/);
  assert.match(src, /saved=\{savedIds\.has\(String\(item\.id\)\)\}/);
  assert.match(src, /savedIds\.size/);
});

test('cargo cards stay compact so collapsing the controls actually increases visible work', () => {
  // Canon density: route city 16/20, compact list spacing on the screen,
  // no legacy expanded-card fork.
  assert.match(card, /fontSize:\s*16,\s*lineHeight:\s*20/);
  assert.match(src, /cardSpacing: \{ marginHorizontal: 18, marginBottom: 7 \}/);
  assert.doesNotMatch(src, /cardExpanded/);
});
