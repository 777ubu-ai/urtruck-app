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

export function searchWorldCities(query, country) {
  const q = String(query || '').trim().toLocaleLowerCase();
  if (!q) return [];
  const hits = [];
  for (const code of country ? [country] : Object.keys(rows)) {
    // Search the compact source tuples first. Materializing each country's
    // complete city directory here permanently retained tens of thousands of
    // objects in the module cache on every global picker search.
    for (const [name, aliases, latitude, longitude, population, id] of rows[code] || []) {
      if (name.toLocaleLowerCase().includes(q)
        || aliases.some((alias) => alias.toLocaleLowerCase().includes(q))) {
        hits.push({ name, aliases, latitude, longitude, population, geonameId: id, country: code, type: 'city', source: 'GeoNames' });
      }
    }
  }
  return hits;
}

export function customCityForCountry(name, country) {
  return { name: String(name || '').trim(), country: country || 'XX', type: 'city', custom: true };
}

export function locationScopeAllowsPoint(scope, country, point) {
  return scope === 'all' || (scope === 'country' && Boolean(country)) || point.type === scope;
}
