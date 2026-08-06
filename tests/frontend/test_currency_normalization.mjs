import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPrice,
  normalizeCargo,
  normalizeCurrency,
  normalizeTrip,
} from '../../src/utils/normalizers.js';

test('normalizes ISO codes, symbols and legacy aliases', () => {
  assert.equal(normalizeCurrency('usd'), 'USD');
  assert.equal(normalizeCurrency('$'), 'USD');
  assert.equal(normalizeCurrency('₸'), 'KZT');
  assert.equal(normalizeCurrency('тенге'), 'KZT');
  assert.equal(normalizeCurrency('руб'), 'RUB');
  assert.equal(normalizeCurrency('rmb'), 'CNY');
  assert.equal(normalizeCurrency('сом'), 'KGS');
});

test('normalizes listing currency before all display paths', () => {
  assert.equal(normalizeCargo({ id: 'c1', currency: '₸' }).currency, 'KZT');
  assert.equal(normalizeTrip({ id: 't1', currency: 'rmb' }).currency, 'CNY');
});

test('formats supported currencies consistently', () => {
  assert.equal(formatPrice(1350, 'RUB'), '₽1 350');
  assert.equal(formatPrice(150000, 'USD'), '$150 000');
  assert.equal(formatPrice(6500, 'CNY'), '¥6 500');
  assert.equal(formatPrice(5000, 'KGS'), '5 000 сом');
});

test('invalid and zero prices remain negotiable', () => {
  assert.equal(formatPrice(0, 'KZT'), 'По договорённости');
  assert.equal(formatPrice('bad', 'USD'), 'По договорённости');
});
