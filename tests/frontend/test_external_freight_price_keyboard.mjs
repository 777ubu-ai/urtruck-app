import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activateExternalFeedFilter } from '../../src/utils/externalFeedFilterPress.js';

const source = readFileSync(new URL('../../src/screens/ExternalFreightFeedScreen.js', import.meta.url), 'utf8');

test('price filter keeps its fields scrollable and Apply above the Android keyboard', () => {
  assert.doesNotMatch(source, /<Modal visible=\{!!modal\}/);
  assert.match(source, /\{modal \? <View style=\{styles\.modalOverlay\}/);
  assert.match(source, /<KeyboardAvoidingView style=\{styles\.keyboardAvoiding\} behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /<ScrollView keyboardShouldPersistTaps="handled" style=\{styles\.sheetScroll\} contentContainerStyle=\{styles\.sheetContent\}>/);

  const scrollStart = source.indexOf('<ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}');
  const apply = source.indexOf('testID="external-feed-apply-filters"');
  const priceInputs = source.indexOf('value={draft.min_price}');
  const priceSort = source.indexOf("[['newest', l.newest]");
  assert.ok(scrollStart >= 0 && apply >= 0 && apply < scrollStart, 'Apply stays in the fixed header above the keyboard');
  assert.ok(priceInputs > scrollStart && priceSort > priceInputs, 'currency and price fields appear before optional sort choices');
});

test('non-location filters mount their scrim only after the chip press completes', () => {
  const filters = { currency: 'KZT' };
  const events = [];
  let scheduled;
  activateExternalFeedFilter({
    name: 'price',
    filters,
    setDraft: value => events.push(['draft', value]),
    setPicker: value => events.push(['picker', value]),
    setModal: value => events.push(['modal', value]),
    schedule: callback => { events.push(['scheduled']); scheduled = callback; },
  });

  assert.deepEqual(events, [['draft', filters], ['scheduled']]);
  scheduled();
  assert.deepEqual(events, [['draft', filters], ['scheduled'], ['modal', 'price']]);
});

test('route filters keep using the location picker directly', () => {
  const filters = {};
  const events = [];
  activateExternalFeedFilter({
    name: 'origin',
    filters,
    setDraft: value => events.push(['draft', value]),
    setPicker: value => events.push(['picker', value]),
    setModal: value => events.push(['modal', value]),
    schedule: callback => { events.push(['scheduled']); callback(); },
  });

  assert.deepEqual(events, [['draft', filters], ['picker', 'origin']]);
});

test('price modal waits until after the Android touch-up event', async () => {
  const events = [];
  activateExternalFeedFilter({
    name: 'price',
    filters: {},
    setDraft: () => events.push('draft'),
    setPicker: () => events.push('picker'),
    setModal: value => events.push(value),
  });

  assert.deepEqual(events, ['draft']);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(events, ['draft', 'price']);
});
