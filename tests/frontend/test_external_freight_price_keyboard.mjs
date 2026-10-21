import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activateExternalFeedFilter } from '../../src/utils/externalFeedFilterPress.js';
const source = readFileSync(new URL('../../src/screens/ExternalFreightFeedScreen.js', import.meta.url), 'utf8');

test('price fields stay in the feed-owned modal with fixed header actions', () => {
  assert.match(source, /<Modal visible=\{!!modal\} transparent/);
  assert.match(source, /modalOverlay: \{ flex: 1 \}/);
  assert.match(source, /<KeyboardAvoidingView/);
  const scrollStart = source.indexOf('<ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}');
  assert.ok(source.indexOf('testID="external-feed-apply-filters"') < scrollStart);
  assert.ok(source.indexOf('testID="external-feed-price-min"') > scrollStart);
});

for (const name of ['origin', 'destination', 'body', 'date', 'price']) {
  test('filter activation: ' + name, () => {
    const events = [];
    const filters = { currency: 'KZT' };
    activateExternalFeedFilter({ name, filters,
      setDraft: value => events.push(['draft', value]),
      setPicker: value => events.push(['picker', value]),
      setModal: value => events.push(['modal', value]),
    });
    assert.deepEqual(events, [['draft', filters], ['modal', name]]);
  });
}
