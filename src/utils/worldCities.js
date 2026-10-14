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
    for (const city of worldCitiesForCountry(code)) {
      if (city.name.toLocaleLowerCase().includes(q)
        || city.aliases.some((name) => name.toLocaleLowerCase().includes(q))) hits.push(city);
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
