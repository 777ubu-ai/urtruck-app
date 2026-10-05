import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COUNTRY_BY_ISO,
  COUNTRY_CATALOG,
  getCountryName,
  searchAllCountries,
} from '../../src/utils/countries.js';
import { COUNTRIES, COUNTRY_ORDER, POINTS } from '../../src/utils/geography.js';

const EUROPE = {
  GB: 'Лондон', IE: 'Дублин', DK: 'Копенгаген', NO: 'Осло', SE: 'Стокгольм',
  FI: 'Хельсинки', IS: 'Рейкьявик', EE: 'Таллин', LV: 'Рига', LT: 'Вильнюс',
  DE: 'Берлин', FR: 'Париж', AT: 'Вена', BE: 'Брюссель', NL: 'Амстердам',
  LU: 'Люксембург', CH: 'Берн', LI: 'Вадуц', MC: 'Монако', IT: 'Рим',
  ES: 'Мадрид', PT: 'Лиссабон', GR: 'Афины', VA: 'Ватикан', SM: 'Сан-Марино',
  MT: 'Валлетта', CY: 'Никосия', AL: 'Тирана', AD: 'Андорра-ла-Велья',
  SI: 'Любляна', HR: 'Загреб', BA: 'Сараево', RS: 'Белград', ME: 'Подгорица',
  MK: 'Скопье', RU: 'Москва', UA: 'Киев', PL: 'Варшава', BY: 'Минск',
  CZ: 'Прага', SK: 'Братислава', HU: 'Будапешт', RO: 'Бухарест', BG: 'София',
  MD: 'Кишинёв',
};

test('canonical catalog has unique ISO identities and complete product locales', () => {
  assert.equal(new Set(COUNTRY_CATALOG.map((country) => country.iso)).size, COUNTRY_CATALOG.length);
  for (const country of COUNTRY_CATALOG) {
    for (const locale of ['RU', 'EN', 'ZH', 'KK']) {
      assert.ok(country.names[locale], `${country.iso} is missing ${locale}`);
    }
  }
});

test('Europe appears once in the shared catalog, routes and capital points', () => {
  for (const [iso, capital] of Object.entries(EUROPE)) {
    assert.ok(COUNTRY_BY_ISO[iso], `${iso} is absent from the catalog`);
    assert.ok(COUNTRIES[iso], `${iso} is absent from route selectors`);
    assert.equal(COUNTRY_ORDER.filter((code) => code === iso).length, 1, `${iso} is duplicated in route order`);
    assert.ok(POINTS.some((point) => point.country === iso && point.name === capital), `${capital} is missing for ${iso}`);
  }
});

test('country search works by localized name, ISO and Moldova alias', () => {
  assert.ok(searchAllCountries('Germany', 'EN').some((country) => country.iso === 'DE'));
  assert.ok(searchAllCountries('法国', 'ZH').some((country) => country.iso === 'FR'));
  assert.ok(searchAllCountries('SE').some((country) => country.iso === 'SE'));
  assert.ok(searchAllCountries('Moldova', 'EN').some((country) => country.iso === 'MD'));
  assert.equal(getCountryName({ iso: 'GB' }, 'RU'), 'Великобритания');
});

test('all selectors depend on the canonical catalog instead of a local country list', () => {
  const geography = fs.readFileSync('src/utils/geography.js', 'utf8');
  const vehicle = fs.readFileSync('src/components/vehicle/VehicleSetupUI.js', 'utf8');
  const citizenship = fs.readFileSync('src/screens/registration/CitizenshipScreen.js', 'utf8');
  const profile = fs.readFileSync('src/screens/onboarding/ProfileV2Screen.js', 'utf8');
  assert.match(geography, /COUNTRY_CATALOG/);
  assert.match(vehicle, /searchAllCountries/);
  assert.match(citizenship, /CountrySheet/);
  assert.match(profile, /CountrySheet/);
});
