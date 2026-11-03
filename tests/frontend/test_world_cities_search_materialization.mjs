import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import rows from '../../src/data/worldCities.js';
import { COUNTRIES, POINTS, searchPoints, searchPointsAsync } from '../../src/utils/geography.js';
import { searchWorldCities, searchWorldCitiesAsync, worldCitiesForCountry } from '../../src/utils/worldCities.js';

test('готовый индекс сохраняет каждое имя и каждый алиас без нормализации при поиске', () => {
  let count = 0;
  for (const cities of Object.values(rows)) {
    for (const row of cities) {
      assert.deepEqual(row[6], [row[0], ...row[1]].map(label => label.toLocaleLowerCase()));
      count++;
    }
  }
  assert.ok(count > 30000, 'проверяется весь исходный справочник');
});

test('холодный поиск не пересчитывает регистр всего справочника', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { searchWorldCities } from './src/utils/worldCities.js';
    const original = String.prototype.toLocaleLowerCase;
    let calls = 0;
    String.prototype.toLocaleLowerCase = function (...args) { calls++; return original.apply(this, args); };
    const hits = searchWorldCities('Нижний Новгород');
    console.log(JSON.stringify({ calls, found: hits.some(hit => hit.geonameId === '520555') }));
  `], { cwd: new URL('../../', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const measured = JSON.parse(result.stdout);
  assert.equal(measured.found, true);
  assert.ok(measured.calls < 10, `нормализация вызвана ${measured.calls} раз`);
});

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


test('порционный поиск сохраняет ранжирование, пробелы, алиасы и страну', async () => {
  for (const query of ['Нижний Новгород ', 'Нью Йорк', 'Ростов-на-Дону', '北京', 'a']) {
    let yields = 0;
    const options = { sliceBudgetMs: 0, allowedCountries: COUNTRIES, yieldTask: async () => { yields++; } };
    assert.deepEqual(await searchWorldCitiesAsync(query, undefined, options), searchWorldCities(query, undefined, options));
    assert.ok(yields > 50, 'глобальный поиск должен отдавать управление многократно');
  }
});

test('новый ввод, смена страны и закрытие прерывают уже начатую работу', async () => {
  for (const reason of ['query', 'country', 'close']) {
    let current = true, slices = 0;
    const result = await searchWorldCitiesAsync('a', undefined, {
      sliceBudgetMs: 0, isCurrent: () => current,
      yieldTask: async () => { slices++; current = false; },
    });
    assert.equal(result, null, reason);
    assert.equal(slices, 1, 'после отмены следующий блок не выполняется');
  }
});


test('нормализованный повтор поиска использует готовый результат и сохраняет отмену', async () => {
  let slices = 0;
  const first = await searchPointsAsync('Нижний Новгород', { onSlice: () => slices++, yieldTask: async () => {} });
  assert.ok(slices > 0);
  slices = 0;
  assert.deepEqual(await searchPointsAsync('Нижний Новгород ', { onSlice: () => slices++ }), first);
  assert.equal(slices, 0);
  assert.equal(await searchPointsAsync('Нижний Новгород', { isCurrent: () => false }), null);
});

test('частота отдачи управления зависит от времени работы, а не от фиксированного числа таймеров', async () => {
  async function measure(tick) {
    let time = 0, yields = 0;
    const hits = await searchWorldCitiesAsync('a', undefined, { now: () => (time += tick), yieldTask: async () => { yields++; } });
    return { hits, yields };
  }
  const fast = await measure(0.1), slow = await measure(1);
  assert.deepEqual(fast.hits, slow.hits);
  assert.ok(fast.yields > 0 && fast.yields < slow.yields);
});
