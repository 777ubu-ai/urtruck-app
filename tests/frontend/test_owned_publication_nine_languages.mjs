import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../../src/utils/languages.js';

const source = readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const start = source.indexOf('const EXPIRY_COPY = ');
const end = source.indexOf('\n};', start);
assert.ok(start >= 0 && end > start);
const copy = Function(source.slice(start, end + 3) + '\nreturn EXPIRY_COPY;')();
const fields = ['expired', 'renew', 'archive', 'hide', 'confirm', 'success', 'error'];
for (const { code } of LANGUAGES) for (const role of ['client', 'driver']) {
  test(`${code} / ${role}: все тексты истечения доступны без fallback`, () => {
    assert.ok(copy[code]);
    for (const field of fields) {
      assert.equal(typeof copy[code][field], 'string');
      assert.ok(copy[code][field].trim());
      if (code !== 'RU' && code !== 'EN') assert.notEqual(copy[code][field], copy.EN[field]);
    }
  });
}
