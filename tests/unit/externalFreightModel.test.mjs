import test from 'node:test';
import assert from 'node:assert/strict';
import { appendUnique, buildExternalFeedQuery, canSortPrice, feedKindForRole, isValidPublicationRange } from '../../src/utils/externalFreightModel.js';

test('feed kind follows the authenticated role and has no guest fallback', () => {
  assert.equal(feedKindForRole('driver'), 'cargo');
  assert.equal(feedKindForRole('client'), 'vehicle');
  assert.equal(feedKindForRole('shipper'), 'vehicle');
  assert.equal(feedKindForRole('guest'), null);
});

test('query preserves route direction, country, currency and local date bounds', () => {
  const query = buildExternalFeedQuery({
    origin: 'Алматы', origin_country: 'KZ', destination: 'Ташкент', destination_country: 'UZ',
    body_type: 'tent', published_from: '20.10.2026', published_to: '21.10.2026',
    currency: 'USD', min_price: '1,5', max_price: '500', sort: 'price_asc',
  }, { cursor: 'next', limit: 30 });
  assert.equal(query.origin, 'Алматы');
  assert.equal(query.destination, 'Ташкент');
  assert.equal(query.origin_country, 'KZ');
  assert.equal(query.destination_country, 'UZ');
  assert.equal(query.currency, 'USD');
  assert.equal(query.min_price, 1.5);
  assert.equal(query.published_from, new Date(2026, 9, 20, 0, 0, 0, 0).toISOString());
  assert.equal(query.published_to, new Date(2026, 9, 21, 23, 59, 59, 999).toISOString());
  assert.equal(query.cursor, 'next');
  assert.equal(buildExternalFeedQuery({}, { cursor: 'next', reset: true }).cursor, undefined);
});

test('price sort requires one currency and valid range', () => {
  assert.equal(canSortPrice({ currency: '', min_price: '1', max_price: '2' }), false);
  assert.equal(canSortPrice({ currency: 'USD', min_price: '10', max_price: '2' }), false);
  assert.equal(canSortPrice({ currency: 'USD', min_price: '1', max_price: '2' }), true);
});

test('publication range accepts reversed calendar dates only when ordered', () => {
  assert.equal(isValidPublicationRange({ published_from: '20.10.2026', published_to: '21.10.2026' }), true);
  assert.equal(isValidPublicationRange({ published_from: '21.10.2026', published_to: '20.10.2026' }), false);
  assert.equal(isValidPublicationRange({ published_from: 'bad', published_to: '21.10.2026' }), false);
});

test('next-page append is idempotent and preserves first-page order', () => {
  const first = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(appendUnique(first, [{ id: 'b' }, { id: 'c' }]), [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});
