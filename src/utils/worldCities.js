import rows from '../data/worldCities.js';

const countries = new Map();
export function worldCitiesForCountry(code) {
  if (!countries.has(code)) {
    countries.set(code, (rows[code] || []).map(([name, aliases, latitude, longitude, population, id]) => ({
      name, aliases, latitude, longitude, population, geonameId: id, country: code, type: 'city', source: 'GeoNames',
    })));
  }
  return countries.get(code);
}

export function searchWorldCities(query, country, { excludedNames, allowedCountries, type } = {}) {
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
  for (const code of country ? [country] : Object.keys(rows)) {
    if (allowedCountries && !allowedCountries[code]) continue;
    // Search the compact source tuples first. Materializing each country's
    // complete city directory here retained tens of thousands of objects in
    // the module cache. Keep only the best twelve raw rows while scanning so
    // even one-character queries do not allocate/sort every matching city.
    for (const row of rows[code] || []) {
      const [name, aliases] = row;
      const rowOrder = order++;
      const nameLower = name.toLocaleLowerCase();
      if (!(nameLower.includes(q)
        || aliases.some((alias) => alias.toLocaleLowerCase().includes(q)))) continue;
      if (excludedNames && (excludedNames.has(`${code}:${nameLower}`)
        || aliases.some((alias) => excludedNames.has(`${code}:${alias.toLocaleLowerCase()}`)))) continue;

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

export function customCityForCountry(name, country) {
  return { name: String(name || '').trim(), country: country || 'XX', type: 'city', custom: true };
}

export function locationScopeAllowsPoint(scope, country, point) {
  return scope === 'all' || (scope === 'country' && Boolean(country)) || point.type === scope;
}
