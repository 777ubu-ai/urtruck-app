import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../../src/screens/ExternalFreightFeedScreen.js', import.meta.url), 'utf8');

test('панель цены оставляет верхние фильтры доступными и не добавляет поля сумм', () => {
  assert.doesNotMatch(source, /<Modal visible=\{!!modal\}/);
  assert.match(source, /top: filterBottom/);
  assert.match(source, /BackHandler\.addEventListener/);
  assert.match(source, /<KeyboardAvoidingView/);
  const scrollStart = source.indexOf('<ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}');
  assert.ok(source.indexOf('testID="external-feed-apply-filters"') < scrollStart);
  assert.ok(source.indexOf('testID="external-feed-price-options"') > scrollStart);
  assert.doesNotMatch(source, /external-feed-price-(?:min|max)|external-feed-currency-/);
  assert.doesNotMatch(source, /const currencies\s*=|currencyChip:/);
  assert.match(source, /\['newest', l\.newest\], \['price_asc', l\.asc\], \['price_desc', l\.desc\]/);
});
