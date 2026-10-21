import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/ExternalFreightFeedScreen.js', import.meta.url), 'utf8');

test('price filter keeps its fields scrollable and Apply above the Android keyboard', () => {
  assert.doesNotMatch(source, /<Modal visible=\{!!modal\}/);
  assert.match(source, /\{modal \? <View style=\{styles\.modalOverlay\}/);
  assert.match(source, /<KeyboardAvoidingView style=\{styles\.keyboardAvoiding\} behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /<ScrollView keyboardShouldPersistTaps="handled" style=\{styles\.sheetScroll\} contentContainerStyle=\{styles\.sheetContent\}>/);

  const scrollStart = source.indexOf('<ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}');
  const apply = source.indexOf('testID="external-feed-apply-filters"');
  const scrollEnd = source.lastIndexOf('</ScrollView>', apply);
  assert.ok(scrollStart >= 0 && scrollEnd > scrollStart && apply > scrollEnd, 'Apply remains a fixed footer outside the scrollable form');
});
