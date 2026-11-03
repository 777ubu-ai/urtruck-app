import rows, { searchCaseProbe } from '../data/worldCities.js';

const countries = new Map();
export function worldCitiesForCountry(code) {
  if (!countries.has(code)) {
    countries.set(code, (rows[code] || []).map(([name, aliases, latitude, longitude, population, id]) => ({
      name, aliases, latitude, longitude, population, geonameId: id, country: code, type: 'city', source: 'GeoNames',
    })));
  }
  return countries.get(code);
}

// Храним только поисковые строки и ссылки на исходные tuple, без каталога city-объектов.
const searchLabels = new WeakMap();
// Особые правила регистра текущей locale сохраняют прежний путь вычисления.
const usePreparedLabels = 'IİÌÍĨJ\u0301I\u0307'.toLocaleLowerCase() === searchCaseProbe;
function labelsFor(row) {
  if (usePreparedLabels && row[6]) return row[6];
  if (!searchLabels.has(row)) {
    searchLabels.set(row, [row[0], ...row[1]].map(label => label.toLocaleLowerCase()));
  }
  return searchLabels.get(row);
}

function* worldCitySearch(query, country, { excludedNames, allowedCountries, type, sliceBudgetMs = 8, now = () => performance.now() } = {}) {
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q || (type && type !== 'city')) return [];
  const limit = 12;
  const selected = [];
  let order = 0;
  const compareCandidate = (name, startsWith, rowOrder, right) => {
    if (startsWith !== right.startsWith) return startsWith ? -1 : 1;
    const byName = name.localeCompare(right.name, 'ru');
    return byName || rowOrder - right.order;
  };
  let scanned = 0;
  let sliceStarted = now();
  for (const code of country ? [country] : Object.keys(rows)) {
    if (allowedCountries && !allowedCountries[code]) continue;
    // Search the compact source tuples first. Materializing each country's
    // complete city directory here retained tens of thousands of objects in
    // the module cache. Keep only the best twelve raw rows while scanning so
    // even one-character queries do not allocate/sort every matching city.
    for (const row of rows[code] || []) {
      // Отдаём управление вводу и кадру до следующей порции работы.
      if (++scanned % 32 === 0 && now() - sliceStarted >= sliceBudgetMs) {
        yield;
        sliceStarted = now();
      }
      const [name] = row;
      const labels = labelsFor(row);
      const nameLower = labels[0];
      const rowOrder = order++;
      if (!(nameLower.includes(q)
        || labels.some((alias) => alias.includes(q)))) continue;
      if (excludedNames && (excludedNames.has(`${code}:${nameLower}`)
        || labels.some((alias) => excludedNames.has(`${code}:${alias}`)))) continue;

      const startsWith = nameLower.startsWith(q);
      let low = 0;
      let high = selected.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (compareCandidate(name, startsWith, rowOrder, selected[middle]) < 0) high = middle;
        else low = middle + 1;
      }
      if (low < limit || selected.length < limit) {
        selected.splice(low, 0, { code, row, startsWith, order: rowOrder, name });
        if (selected.length > limit) selected.pop();
      }
    }
  }
  return selected.map(({ code, row: [name, aliases, latitude, longitude, population, id] }) => ({
    name, aliases, latitude, longitude, population, geonameId: id, country: code, type: 'city', source: 'GeoNames',
  }));
}

// Синхронный контракт сохранён для прочих потребителей и тестов.
export function searchWorldCities(query, country, options) {
  const work = worldCitySearch(query, country, options);
  let step;
  do { step = work.next(); } while (!step.done);
  return step.value;
}

export async function searchWorldCitiesAsync(query, country, options = {}) {
  const { isCurrent = () => true, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = options;
  const work = worldCitySearch(query, country, options);
  while (isCurrent()) {
    const sliceStarted = performance.now();
    const step = work.next();
    options.onSlice?.(performance.now() - sliceStarted);
    if (step.done) return step.value;
    await yieldTask();
  }
  return null;
}

export function customCityForCountry(name, country) {
  return { name: String(name || '').trim(), country: country || 'XX', type: 'city', custom: true };
}

export function locationScopeAllowsPoint(scope, country, point) {
  return scope === 'all' || (scope === 'country' && Boolean(country)) || point.type === scope;
}
