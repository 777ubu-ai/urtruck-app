import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cargoInputText, normalizeCargoDescription } from '../../src/utils/places.js';
import { customCityForCountry } from '../../src/utils/worldCities.js';
import { searchPoints } from '../../src/utils/geography.js';

const cargoInput = fs.readFileSync('src/components/CargoTypeInput.js', 'utf8');
const createCargo = fs.readFileSync('src/screens/CreateCargoScreen.js', 'utf8');
const picker = fs.readFileSync('src/components/LocationPickerModal.js', 'utf8');

test('editable cargo value keeps keystrokes, spaces, paste, newline and middle edits verbatim', () => {
  let value = '';
  for (const next of [
    'Оборудование ',
    'Оборудование в ',
    'Оборудование в деревянных ящиках ',
    'Оборудование в деревянных ящиках\nХрупкое',
    'Оборудование в деревянных паллетах\nХрупкое',
    'Оборудование в деревянных ящиках\nХрупкое',
  ]) {
    value = cargoInputText(next);
    assert.equal(value, next);
  }
  assert.equal(cargoInputText(''), '');
  assert.equal(cargoInputText(null), '');
  assert.equal(cargoInputText('  设备箱装  '), '  设备箱装  ');
});

test('submission normalization is separate from the editable text', () => {
  const raw = '  Оборудование в деревянных ящиках  ';
  assert.equal(cargoInputText(raw), raw);
  assert.equal(normalizeCargoDescription(raw), 'Оборудование в деревянных ящиках');
  assert.match(cargoInput, /value=\{query\}[\s\S]*?onChangeText=\{handleChange\}/);
  assert.match(cargoInput, /<TextInput[\s\S]*?multiline/);
  assert.match(cargoInput, /const query = .*cargoInputText\(value\)/);
  assert.doesNotMatch(cargoInput, /setQuery|selectedSuggestion/);
  assert.match(cargoInput, /localizeCargoName\(c\.name,\s*lang\)/);
  assert.match(cargoInput, /onPress=\{\(\) => pick\(c\)\}/);
  assert.match(createCargo, /normalizeCargoDescription\(cargoDesc\)/);
});

test('draft restore finishes before create-cargo form is mounted', () => {
  assert.match(createCargo, /if \(!draft\.ready\) return/);
});

test('manual city input remains immediate while only suggestions are delayed', () => {
  assert.match(picker, /onChangeText=\{handleQueryChange\}/);
  assert.match(picker, /searchScheduler\.schedule\(searchKey, async/);
  assert.match(picker, /if \(searchPending\) return \{ countryHits: \[\], pointHits: \[\] \}/);
  assert.doesNotMatch(picker, /onChangeText=\{[^}]*localizePlace/);
});

test('city queries keep internal spaces; normalization happens only after explicit custom-city selection', () => {
  for (const query of ['Нижний Новгород', 'Нью Йорк', 'Ростов-на-Дону']) {
    const spacedQuery = `${query} `;
    assert.equal(spacedQuery.slice(0, -1), query);
    const selected = customCityForCountry(spacedQuery, 'RU');
    assert.equal(selected.name, query);
    const results = searchPoints(query).map((point) => point.name);
    assert.ok(results.length > 0, `${query} must return city suggestions`);
    assert.deepEqual(searchPoints(spacedQuery).map((point) => point.name), results,
      'trailing whitespace may be normalized for lookup without rewriting the input value');
  }
});
