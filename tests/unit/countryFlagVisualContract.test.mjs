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
const routeLineSource = fs.readFileSync(
  path.resolve(here, '../../src/components/ui/v1/RouteLine.js'),
  'utf8'
);

const REQUIRED_ROUTE_CODES = [
  'CN', 'KZ', 'UZ', 'KG', 'RU', 'BY', 'TJ', 'TM', 'AM', 'AZ', 'GE', 'TR',
  'UA', 'PL', 'CZ', 'RO', 'HU', 'BG', 'LT', 'LV', 'EE', 'DE', 'FR', 'IT',
  'ES', 'US', 'GB', 'JP', 'KR', 'IN', 'AE',
];

const COMPOSITION_SENSITIVE_CODES = ['CN', 'KZ', 'UZ', 'BY', 'TM', 'AZ', 'TJ', 'KG'];

test('CountryFlag keeps standards-based SVG artwork and ISO lookup', () => {
  assert.match(source, /country-flag-icons\/string\/1x1/);
  assert.match(source, /normalizeCountryCode/);
  assert.match(source, /countryCode\(raw\)/);
  assert.match(source, /COUNTRY_FLAG_CODES/);
  assert.match(source, /KZ_FULL_FLAG_BASE64/);
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

test('composition-sensitive flags retain bundled master artwork without center-crop', () => {
  for (const code of COMPOSITION_SENSITIVE_CODES) {
    const xml = FLAG_XML[code];
    assert.ok(xml, `${code} has bundled artwork`);
    assert.match(xml, /viewBox="[^"]+"/, `${code} has complete SVG viewBox geometry`);
  }
  assert.match(source, /useFullKzArtwork/);
  assert.match(source, /KZ_FULL_FLAG_XML/);
  assert.doesNotMatch(source, /preserveAspectRatio=["'][^"']*slice/);
});

test('round CountryFlag is an enamel badge with an unclipped shadow and no white shell', () => {
  assert.match(source, /roundRoot/);
  assert.match(source, /metalRim/);
  assert.match(source, /flagClip/);
  assert.match(source, /enamelGloss/);
  assert.match(source, /innerShade/);
  assert.match(source, /LinearGradient/);
  assert.match(source, /boxShadow:/);
  assert.match(source, /SvgXml xml=\{KZ_FULL_FLAG_XML\}/);
  assert.match(source, /useFullKzArtwork/);
  assert.doesNotMatch(source, /depthDisc|roundShell|highlightRing/);
  assert.doesNotMatch(source, /backgroundColor: '#FFFFFF'/);
  assert.match(source, /overflow: 'visible'/);
  assert.match(source, /flagClip:[\s\S]*overflow: 'hidden'/);
});

test('CountryFlag fallback keeps the ISO code inside the same enamel construction', () => {
  assert.match(source, /fallbackRound/);
  assert.match(source, /fallbackCode/);
  assert.match(source, /backgroundColor: '#E7E3DA'/);
  assert.match(source, /color: '#59665F'/);
});

test('CountryFlag defaults to round rendering without emoji fallback', () => {
  assert.match(source, /round = true/);
  assert.doesNotMatch(source, /getUnicodeFlagIcon/);
});

test('country picker leaves CountryFlag directly on the screen without a square holder', () => {
  assert.match(locationPickerSource, /<CountryFlag code=\{code\} width=\{36\}/);
  const leadStyle = locationPickerSource.match(/lead:\s*\{([^}]*)\}/)?.[1] || '';
  assert.doesNotMatch(leadStyle, /backgroundColor|borderWidth|borderColor/);
});

test('deal route flags use the specified 28 dp enamel size', () => {
  assert.match(routeLineSource, /<CountryFlag code=\{fromFlag\} width=\{32\}/);
  assert.match(routeLineSource, /<CountryFlag code=\{toFlag\} width=\{32\}/);
});
