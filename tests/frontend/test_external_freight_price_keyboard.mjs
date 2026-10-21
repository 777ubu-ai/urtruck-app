import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/ExternalFreightFeedScreen.js', import.meta.url), 'utf8');

test('price filter keeps its fields scrollable and Apply above the Android keyboard', () => {
  assert.match(source, /Keyboard\.addListener\('keyboardDidShow'/);
  assert.match(source, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(source, /marginBottom:\s*keyboardHeight/);
  assert.match(source, /maxHeight:\s*Math\.max\(220,\s*Dimensions\.get\('screen'\)\.height\s*-\s*keyboardHeight/);
  assert.match(source, /<ScrollView keyboardShouldPersistTaps="handled" style=\{styles\.sheetScroll\} contentContainerStyle=\{styles\.sheetContent\}>/);

  const scrollStart = source.indexOf('<ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}');
  const apply = source.indexOf('testID="external-feed-apply-filters"');
  const scrollEnd = source.lastIndexOf('</ScrollView>', apply);
  assert.ok(scrollStart >= 0 && scrollEnd > scrollStart && apply > scrollEnd, 'Apply remains a fixed footer outside the scrollable form');
});
