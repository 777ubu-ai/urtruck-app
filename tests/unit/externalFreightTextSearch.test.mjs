import test from 'node:test';
import assert from 'node:assert/strict';
import { externalLocationTextSelection, buildExternalFeedQuery } from '../../src/utils/externalFreightModel.js';
import { ALL_COUNTRIES } from '../../src/utils/countries.js';

test('free text keeps routes including unknown towns without inventing a country', () => {
  for (const value of ['Хоргос', 'Бахты', 'Новый посёлок', '霍尔果斯', 'Khorgos']) {
    assert.deepEqual(externalLocationTextSelection('origin', value, ALL_COUNTRIES), { origin: value, origin_country: '' });
  }
});
test('exact country names work in all app languages and ISO, partial names stay text', () => {
  for (const value of ['Китай', 'Қытай', '中国', 'China', 'cn']) {
    assert.deepEqual(externalLocationTextSelection('destination', value, ALL_COUNTRIES), { destination: '', destination_country: 'CN' });
  }
  assert.deepEqual(externalLocationTextSelection('origin', 'Кит', ALL_COUNTRIES), { origin: 'Кит', origin_country: '' });
});
test('replacement and clearing remove stale country filters and keep the other direction', () => {
  const before = { origin: '', origin_country: 'CN', destination: 'Ташкент', destination_country: '' };
  const next = { ...before, ...externalLocationTextSelection('origin', '  Бахты  ', ALL_COUNTRIES) };
  assert.deepEqual(buildExternalFeedQuery(next), { origin: 'Бахты', destination: 'Ташкент', limit: 30 });
  assert.deepEqual(externalLocationTextSelection('origin', '   ', ALL_COUNTRIES), { origin: '', origin_country: '' });
  assert.throws(() => externalLocationTextSelection('role', 'driver'), /invalid_location_key/);
});
