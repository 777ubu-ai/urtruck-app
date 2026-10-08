import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ALL_COUNTRIES, getCountryName } from '../../src/utils/countries.js';
import { COUNTRIES, COUNTRY_ORDER, pointsForCountry, formatPoint } from '../../src/utils/geography.js';
import * as FLAGS from 'country-flag-icons/string/1x1';

test('route country selection includes the complete existing ISO directory and bundled flags', () => {
  assert.equal(new Set(COUNTRY_ORDER).size, COUNTRY_ORDER.length);
  assert.deepEqual(new Set(COUNTRY_ORDER), new Set(ALL_COUNTRIES.map(c => c.iso)));
  for (const code of COUNTRY_ORDER) {
    assert.ok(COUNTRIES[code]?.name, code);
    assert.ok(FLAGS[code], code + ' bundled flag');
  }
});
test('Germany, Belgium and Netherlands are selectable with localized names', () => {
  for (const code of ['DE', 'BE', 'NL']) {
    assert.ok(COUNTRY_ORDER.includes(code));
    for (const lang of ['RU', 'ZH', 'EN', 'KK']) {
      assert.notEqual(getCountryName(code, lang), code);
    }
  }
  assert.equal(getCountryName('DE', 'ZH'), '德国');
  assert.equal(getCountryName('BE', 'ZH'), '比利时');
});
test('approved corridor order and existing route point values stay stable', () => {
  assert.deepEqual(COUNTRY_ORDER.slice(0, 8), ['CN','KZ','UZ','KG','RU','BY','TJ','TM']);
  const almaty = pointsForCountry('KZ').find(p => p.name === 'Алматы');
  assert.ok(almaty);
  assert.equal(formatPoint(almaty), 'Алматы');
});
test('picker fallback uses shared localized names and keeps approved flag size', () => {
  const s = fs.readFileSync('src/components/LocationPickerModal.js', 'utf8');
  assert.match(s, /getCountryName\(code, lang\)/);
  assert.match(s, /<CountryFlag code=\{code\} width=\{26\}/);
});
