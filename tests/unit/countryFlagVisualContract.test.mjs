import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as FLAG_XML from 'country-flag-icons/string/1x1';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, '../../src/components/ui/v1/CountryFlag.js'),
  'utf8'
);
const kzAsset = fs.readFileSync(
  path.resolve(here, '../../src/assets/flags/kz.svg'),
  'utf8'
);
const locationPickerSource = fs.readFileSync(
  path.resolve(here, '../../src/components/LocationPickerModal.js'),
  'utf8'
);

const REQUIRED_ROUTE_CODES = [
  'CN', 'KZ', 'UZ', 'KG', 'RU', 'BY', 'TJ', 'TM', 'AM', 'AZ', 'GE', 'TR',
  'UA', 'PL', 'CZ', 'RO', 'HU', 'BG', 'LT', 'LV', 'EE', 'DE', 'FR', 'IT',
  'ES', 'US', 'GB', 'JP', 'KR', 'IN', 'AE',
];

test('CountryFlag keeps standards-based SVG artwork and ISO lookup', () => {
  assert.match(source, /country-flag-icons\/string\/1x1/);
  assert.match(source, /normalizeCountryCode/);
  assert.match(source, /countryCode\(raw\)/);
  assert.match(source, /COUNTRY_FLAG_CODES/);
  assert.match(source, /assets\/flags\/kz\.svg/);
});

test('KZ keeps its full official square artwork instead of the simplified sun-only icon', () => {
  assert.match(kzAsset, /viewBox="0 0 512 512"/);
  assert.match(kzAsset, /M1075\.8 655/); // detailed golden eagle path
  assert.ok(kzAsset.length > 6000, 'KZ asset keeps the full ornament and eagle geometry');
});

test('the canonical ISO renderer covers every required route country', () => {
  for (const code of REQUIRED_ROUTE_CODES) {
    assert.ok(FLAG_XML[code], `${code} has bundled canonical artwork`);
  }
});

test('round CountryFlag uses a separate depth, white shell and complete circular artwork', () => {
  assert.match(source, /roundRoot/);
  assert.match(source, /depthDisc/);
  assert.match(source, /roundShell/);
  assert.match(source, /roundClip/);
  assert.match(source, /highlightRing/);
  assert.match(source, /SvgUri/);
  assert.match(source, /useFullKzArtwork/);
  assert.match(source, /backgroundColor: '#FFFFFF'/);
  assert.match(source, /shadowOpacity:/);
});

test('CountryFlag defaults to round rendering without emoji fallback', () => {
  assert.match(source, /round = true/);
  assert.doesNotMatch(source, /getUnicodeFlagIcon/);
});

test('country picker leaves CountryFlag directly on the screen without a square holder', () => {
  assert.match(locationPickerSource, /<CountryFlag code=\{code\} width=\{25\}/);
  const leadStyle = locationPickerSource.match(/lead:\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(leadStyle, /backgroundColor|borderWidth|borderColor/);
});
