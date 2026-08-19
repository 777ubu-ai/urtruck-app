import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wrapper = fs.readFileSync('src/screens/ChatsListScreen.js', 'utf8');
const src = fs.readFileSync('src/screens/DealsScreen.js', 'utf8');

test('Deals route is isolated from legacy chat list so chat behavior is preserved', () => {
  assert.match(wrapper, /route\?\.name === 'Deals'/);
  assert.match(wrapper, /<DealsScreen \{\.\.\.props\} \/>/);
  assert.match(wrapper, /<ChatsListScreenLegacy \{\.\.\.props\} \/>/);
});

test('deals header keeps only menu and floating work chips', () => {
  assert.match(src, /testID="deals-minimal-header"/);
  assert.match(src, /testID="deals-floating-tabs"/);
  assert.match(src, /key: 'offers'/);
  assert.match(src, /key: 'active'/);
  assert.match(src, /key: 'archive'/);
  assert.doesNotMatch(src, /handshake-outline/);
  assert.doesNotMatch(src, />\{.*tab_deals.*\}</);
});

test('search is the FlatList header so it scrolls away while deal tabs remain above the list', () => {
  assert.match(src, /const listHeader = \(/);
  assert.match(src, /ListHeaderComponent=\{listHeader\}/);
  assert.match(src, /testID="deal-room-search"/);
  assert.match(src, /testID="deals-floating-tabs"/);
  assert.doesNotMatch(src, /stickyHeaderIndices/);
});

test('archive is a separate compact control with completed/cancelled/rejected filters', () => {
  assert.match(src, /compact: true/);
  assert.match(src, /testID="deals-archive-filters"/);
  assert.match(src, /\['completed', copy\.completed\]/);
  assert.match(src, /\['cancelled', copy\.cancelled\]/);
  assert.match(src, /\['rejected', copy\.rejected\]/);
});

test('deal cards are compact and do not render the old decorative avatar or dollar block', () => {
  assert.match(src, /minHeight: 88/);
  assert.match(src, /fontSize: 14, lineHeight: 19, fontWeight: '700'/);
  assert.doesNotMatch(src, /s\.avatar/);
  assert.doesNotMatch(src, /name="dollar-sign"/);
});

test('new deal UI is localized without Russian fallback for non-Russian languages', () => {
  assert.match(src, /RU: \{/);
  assert.match(src, /EN: \{/);
  assert.match(src, /ZH: \{/);
  assert.match(src, /KK: \{/);
  assert.match(src, /const copy = COPY\[lang\] \|\| COPY\.EN/);
});
