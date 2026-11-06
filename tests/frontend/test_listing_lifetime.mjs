import test from 'node:test';
import assert from 'node:assert/strict';
import { isListingExpired } from '../../src/utils/listingLifetime.js';
const boundary = Date.parse('2026-11-04T12:00:00Z');
for (const item of [
  { published_at: '2026-10-05 12:00:00', departure: '2020-01-01' },
  { published_at: '2026-10-05T17:00:00+05:00' },
  { created_at: '2026-10-05T12:00:00Z' },
  { published_at: 'invalid', created_at: '2026-10-05T12:00:00Z' },
]) {
  test(`Срок UTC, до/в момент/после границы: ${JSON.stringify(item)}`, () => {
    assert.equal(isListingExpired(item, boundary - 1), false);
    assert.equal(isListingExpired(item, boundary), true);
    assert.equal(isListingExpired(item, boundary + 1), true);
  });
}
test('Повторная публикация использует published_at; изменение маршрута не продлевает срок', () => {
  assert.equal(isListingExpired({ published_at: '2026-11-01', created_at: '2020-01-01' }, boundary), false);
  assert.equal(isListingExpired({ published_at: '2020-01-01', departure: '2099-01-01' }, boundary), true);
});
test('Активные собственные груз/рейс продлеваются; архив и внешняя лента сохраняют TTL', () => {
  const old = { published_at: '2020-01-01', status: 'active' };
  assert.equal(isListingExpired({ ...old, driver_id: 'driver' }, boundary), false);
  assert.equal(isListingExpired({ ...old, owner_id: 'client' }, boundary), false);
  assert.equal(isListingExpired({ ...old, owner_id: 'client', status: 'expired' }, boundary), true);
  assert.equal(isListingExpired({ ...old, driver_id: 'driver', status: 'expired' }, boundary), true);
  assert.equal(isListingExpired({ ...old, kind: 'vehicle' }, boundary), true);
});
