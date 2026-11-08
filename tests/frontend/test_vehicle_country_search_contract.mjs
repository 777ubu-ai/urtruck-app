import test from 'node:test';
import assert from 'node:assert/strict';
import { searchAllCountries } from '../../src/utils/countries.js';

const firstIso = (query, lang = 'RU') => searchAllCountries(query, lang).map((c) => c.iso);

test('vehicle country search finds visible Russian country names on Hermes fallback', () => {
  assert.ok(firstIso('Казахстан').includes('KZ'));
  assert.ok(firstIso('Россия').includes('RU'));
});

test('vehicle country search is multilingual and keeps ISO lookup', () => {
  assert.ok(firstIso('Kazakhstan', 'EN').includes('KZ'));
  assert.ok(firstIso('Russia', 'EN').includes('RU'));
  assert.ok(firstIso('Қазақстан', 'KK').includes('KZ'));
  assert.ok(firstIso('中国', 'ZH').includes('CN'));
  assert.ok(firstIso('KZ').includes('KZ'));
});

test('vehicle country picker remains full local ISO catalogue', () => {
  const all = searchAllCountries('', 'RU');
  assert.ok(all.length >= 248, `expected >=248 countries, got ${all.length}`);
  assert.equal(new Set(all.map((c) => c.iso)).size, all.length);
});
