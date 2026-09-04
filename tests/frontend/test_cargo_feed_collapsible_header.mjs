import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');

test('cargo feed removes heavy brand/title chrome and keeps only compact menu above list', () => {
  assert.match(src, /testID="cargo-feed-minimal-header"/);
  assert.match(src, /testID="feed-menu-btn"/);
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
  // Task 3 §20: «Избранное» — вторичный фильтр, он обязан выживать Back,
  // поэтому начальное значение приходит из session-снимка. Дефолт по
  // отсутствующему снимку остался false — это и проверяем.
  assert.match(src, /const \[savedOnly, setSavedOnly\] = useState\(snapshot\.filters\?\.savedOnly \?\? false\)/);
  assert.match(src, /savedOnly && !savedIds\.has\(String\(item\.id\)\)/);
  assert.match(src, /setSavedOnly\(\(value\) => !value\)/);
  assert.match(src, /saved=\{savedIds\.has\(String\(item\.id\)\)\}/);
  assert.match(src, /savedIds\.size/);
});

test('cargo cards stay compact so collapsing the controls actually increases visible work', () => {
  // Task 3 §13 уменьшил карточку груза 120 → 100. Интент этого контракта
  // («карточка остаётся компактной, поэтому сворачивание контролов реально
  // добавляет видимой работы») не нарушен — 100 компактнее 120; устарело
  // именно зафиксированное число.
  assert.match(src, /minHeight: 100/);
  assert.match(src, /fontSize: 16, lineHeight: 20/);
  assert.doesNotMatch(src, /cardExpanded/);
});
