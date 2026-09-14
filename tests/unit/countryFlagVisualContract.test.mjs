import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(here, '../../src/components/ui/v1/CountryFlag.js'),
  'utf8'
);

test('CountryFlag keeps standards-based SVG artwork and ISO lookup', () => {
  assert.match(source, /country-flag-icons\/string\/3x2/);
  assert.match(source, /normalizeCountryCode/);
  assert.match(source, /countryCode\(raw\)/);
  assert.match(source, /COUNTRY_FLAG_CODES/);
});

test('round CountryFlag uses a separate depth, white shell and clipped circular artwork', () => {
  assert.match(source, /roundRoot/);
  assert.match(source, /depthDisc/);
  assert.match(source, /roundShell/);
  assert.match(source, /roundClip/);
  assert.match(source, /highlightRing/);
  assert.match(source, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(source, /backgroundColor: '#FFFFFF'/);
  assert.match(source, /shadowOpacity:/);
});

test('CountryFlag defaults to round rendering without emoji fallback', () => {
  assert.match(source, /round = true/);
  assert.doesNotMatch(source, /getUnicodeFlagIcon/);
});
