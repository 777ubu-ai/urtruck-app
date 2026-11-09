import { ALL_COUNTRIES } from './countries';
import aliases from './routeCountryAliases';

// Только известные значения серверного справочника; неизвестная страна остаётся пустой.
// Соответствие backend/services/geo_normalize.py проверяется регрессией.
export function routeCountryCode(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  const code = aliases[raw.toLowerCase()] || raw.toUpperCase();
  return ALL_COUNTRIES.some(country => country.iso === code) ? code : '';
}
