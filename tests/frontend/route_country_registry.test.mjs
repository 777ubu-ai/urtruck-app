import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ALL_COUNTRIES, getCountryName } from '../../src/utils/countries.js';
import { COUNTRIES, COUNTRY_ORDER, pointsForCountry, formatPoint } from '../../src/utils/geography.js';
import * as FLAGS from 'country-flag-icons/string/1x1';

test('route country selection includes the complete existing ISO directory and bundled flags', () => {
  assert.equal(COUNTRY_ORDER.length, 249);
  assert.equal(ALL_COUNTRIES.length, 249);
  assert.ok(COUNTRY_ORDER.includes('AX'));
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


// Проверяем реальный bundled fallback: Intl.DisplayNames у части Hermes отсутствует.
test('all 249 countries have four localized names and search without Intl.DisplayNames', () => {
  const source = fs.readFileSync('src/utils/countries.js', 'utf8')
    .replace(/^export default .*;$/gm, '')
    .replace(/\bexport (?=const |function )/g, '');
  const context = { Intl: { DisplayNames: undefined } };
  vm.runInNewContext(source + '\nthis.countries = { ALL_COUNTRIES, getCountryName, searchAllCountries };', context, { timeout: 1000 });
  const catalogue = context.countries;
  assert.equal(catalogue.ALL_COUNTRIES.length, 249);
  const expectedAX = { RU: 'Аландские о-ва', ZH: '奥兰群岛', EN: 'Åland Islands', KK: 'Аланд аралдары' };
  for (const [lang, name] of Object.entries(expectedAX)) assert.equal(catalogue.getCountryName('AX', lang), name);
  for (const country of catalogue.ALL_COUNTRIES) {
    for (const lang of ['RU', 'ZH', 'EN', 'KK']) {
      const name = catalogue.getCountryName(country.iso, lang);
      assert.ok(name && name !== country.iso, country.iso + ' ' + lang);
      assert.ok(catalogue.searchAllCountries(name, lang).some(c => c.iso === country.iso), country.iso + ' search ' + lang);
    }
    assert.ok(catalogue.searchAllCountries(country.iso).some(c => c.iso === country.iso));
  }
});
