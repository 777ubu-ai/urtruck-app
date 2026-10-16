import test from 'node:test';
import assert from 'node:assert/strict';
import { searchWorldCities, worldCitiesForCountry } from '../../src/utils/worldCities.js';

test('global city search only materializes matching compact-directory entries', () => {
  const hits = searchWorldCities('Berlin', 'DE');
  assert.ok(hits.some((city) => city.name === 'Berlin'));
  assert.ok(hits.every((city) => city.country === 'DE' && city.type === 'city'));

  const matchingDirectoryEntry = worldCitiesForCountry('DE')
    .find((city) => city.geonameId === hits.find((hit) => hit.name === 'Berlin')?.geonameId);
  assert.ok(matchingDirectoryEntry, 'country picker still exposes the same GeoNames record');
  assert.notStrictEqual(
    hits.find((hit) => hit.name === 'Berlin'),
    matchingDirectoryEntry,
    'search results must not be references into the cached fully materialized country directory',
  );
});

test('city search keeps alias matching and country scoping', () => {
  const aliasHits = searchWorldCities('Андора ла Веля', 'AD');
  assert.ok(aliasHits.some((city) => city.name === 'Andorra la Vella'));
  assert.deepEqual(searchWorldCities('Berlin', 'FR'), []);
  assert.deepEqual(searchWorldCities('   ', undefined), []);
});
