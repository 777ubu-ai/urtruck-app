import test from 'node:test';
import assert from 'node:assert/strict';
import rows from '../../src/data/worldCities.js';
import { COUNTRIES, POINTS, searchPoints } from '../../src/utils/geography.js';
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

test('one-character global search preserves previous top results without materializing every match', () => {
  const query = 'a';
  const excluded = new Set(POINTS.filter((point) => point.type === 'city')
    .flatMap((point) => [point.name, ...(point.aliases || [])]
      .map((name) => `${point.country}:${name.toLocaleLowerCase()}`)));
  let order = 0;
  const allMatches = Object.entries(rows).flatMap(([country, cities]) => {
    return cities.flatMap(([name, aliases, , , , id]) => {
      const rowOrder = order++;
      if (!COUNTRIES[country]) return [];
      const nameLower = name.toLocaleLowerCase();
      if (!(nameLower.includes(query)
        || aliases.some((alias) => alias.toLocaleLowerCase().includes(query)))) return [];
      if (excluded.has(`${country}:${nameLower}`)
        || aliases.some((alias) => excluded.has(`${country}:${alias.toLocaleLowerCase()}`))) return [];
      return [{ name, aliases, country, id, starts: nameLower.startsWith(query), order: rowOrder }];
    });
  });
  allMatches.sort((left, right) => Number(right.starts) - Number(left.starts)
    || left.name.localeCompare(right.name, 'ru')
    || left.order - right.order);

  const actual = searchWorldCities(query, undefined, {
    allowedCountries: COUNTRIES,
    excludedNames: excluded,
  });
  assert.ok(allMatches.length > 12, 'the fixture exercises many matches');
  assert.equal(actual.length, 12);
  assert.deepEqual(actual.map(({ name, country, geonameId }) => [name, country, geonameId]),
    allMatches.slice(0, 12).map(({ name, country, id }) => [name, country, id]));
  const oldWorldResults = allMatches.map(({ name, country, aliases }) => ({ name, country, aliases }));
  const oldResults = [...POINTS, ...oldWorldResults]
    .filter((point) => [point.name, ...(point.aliases || [])].some((label) => label.toLowerCase().includes(query))
      || COUNTRIES[point.country]?.name.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftStarts = left.name.toLowerCase().startsWith(query);
      const rightStarts = right.name.toLowerCase().startsWith(query);
      return Number(rightStarts) - Number(leftStarts) || left.name.localeCompare(right.name, 'ru');
    })
    .slice(0, 12)
    .map(({ name, country }) => [name, country]);
  const newResults = searchPoints(query).map(({ name, country }) => [name, country]);
  assert.deepEqual(newResults, oldResults, 'picker top results must keep the previous ranking and labels');
});
