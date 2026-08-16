// Geography smoke — static parity check that the registry contains
// every country and crossing the operator listed for Stage 7.
//
// Pass criteria:
//   1. COUNTRIES has the 21 countries the brief named.
//   2. POINT_TYPES contains city / border / terminal.
//   3. The five strategic CN↔KZ border crossings are present:
//      Нур Жолы / Достык / Бахты / Майкапчагай / Калжат.
//   4. Малашевичи (PL terminal) is present.
//   5. The picker component imports the registry helpers.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const GEO = path.join(ROOT, 'src', 'utils', 'geography.js');
const PICKER = path.join(ROOT, 'src', 'components', 'RoutePointPicker.js');
const PLACES = path.join(ROOT, 'src', 'utils', 'places.js');
const CITIES = path.join(ROOT, 'src', 'utils', 'cities.js');

const REQUIRED_COUNTRIES = [
  'CN', 'KZ', 'UZ', 'KG', 'RU', 'BY', 'TJ', 'TM',
  'AM', 'GE', 'AZ', 'PL', 'LT', 'LV', 'EE',
  'HU', 'RO', 'SK', 'TR', 'BG', 'GR',
];

const REQUIRED_BORDERS = [
  'Нур Жолы',
  'Достык',
  'Бахты',
  'Майкапчагай',
  'Калжат',
];

const failures = [];
const src = fs.readFileSync(GEO, 'utf8');

// 1. Countries
for (const code of REQUIRED_COUNTRIES) {
  const re = new RegExp(`\\b${code}:\\s*\\{\\s*flag:`);
  if (!re.test(src)) failures.push(`country ${code} missing from COUNTRIES`);
}

// 2. Point types
for (const t of ['city', 'border', 'terminal']) {
  if (!new RegExp(`key:\\s*'${t}'`).test(src)) failures.push(`POINT_TYPES missing key '${t}'`);
}

// 3. Borders — must appear inside POINTS
for (const name of REQUIRED_BORDERS) {
  if (!src.includes(name)) failures.push(`border '${name}' missing from POINTS`);
}

// 4. Малашевичи
if (!src.includes('Малашевичи')) failures.push("'Малашевичи' missing from POINTS");

// 5. Picker imports registry helpers
const pickerSrc = fs.readFileSync(PICKER, 'utf8');
for (const sym of ['COUNTRIES', 'POINT_TYPES', 'searchPoints', 'formatPoint', 'pointsForCountry']) {
  if (!new RegExp(`\\b${sym}\\b`).test(pickerSrc)) failures.push(`RoutePointPicker doesn't reference ${sym}`);
}

// 6. EN aliases for the most-used logistics nodes.
const REQUIRED_ALIASES = {
  Хоргос: 'Khorgos',
  Алашанькоу: 'Alashankou',
  Достык: 'Dostyk',
  Малашевичи: 'Malaszewicze',
};
for (const [name, alias] of Object.entries(REQUIRED_ALIASES)) {
  const linePattern = new RegExp(`'${name}'[^\\n]*?'${alias}'`);
  if (!linePattern.test(src)) failures.push(`'${name}' missing English alias '${alias}'`);
}

// 7. Picker free-text fallback inherits country.
if (!/inferCountryFromQuery/.test(pickerSrc)) {
  failures.push('RoutePointPicker free-text fallback no longer infers country');
}
if (/onChange\?\.\(trimmed,\s*\{\s*name:\s*trimmed,\s*country:\s*'XX'/.test(pickerSrc)) {
  failures.push('RoutePointPicker still hard-codes country=XX in free-text fallback');
}

// 8. Every required country has a localised name in all enabled languages.
const I18N_PATH = path.join(ROOT, 'src', 'utils', 'i18n.js');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
for (const code of REQUIRED_COUNTRIES) {
  for (const lang of ['RU', 'EN', 'KK', 'ZH']) {
    const blockMatch = new RegExp(`\\n  ${lang}: \\{[\\s\\S]*?\\n\\},`, 'm').exec(i18nSrc);
    if (!blockMatch) {
      failures.push(`i18n block ${lang} not found`);
      break;
    }
    const block = blockMatch[0];
    if (!new RegExp(`country_${code}\\s*:\\s*'`).test(block)) {
      failures.push(`i18n: country_${code} missing in ${lang}`);
    }
  }
}

// 9. Picker uses localisedCountryName rather than the bare registry name.
if (!/localisedCountryName/.test(pickerSrc)) {
  failures.push('RoutePointPicker no longer uses localisedCountryName helper');
}

// 10. Every curated city visible in route pickers must have a ZH/EN translation.
const placesSrc = fs.readFileSync(PLACES, 'utf8');
const citySrc = fs.readFileSync(CITIES, 'utf8');
const translatedPlaces = new Set(
  [...placesSrc.matchAll(/^\s*'([^']+)':\s*\{\s*zh:\s*'[^']+',\s*en:/gm)].map((m) => m[1]),
);
const curatedNames = new Set([
  ...[...src.matchAll(/\bc\('[A-Z]+',\s*'([^']+)'/g)].map((m) => m[1]),
  ...[...citySrc.matchAll(/\{ name: '([^']+)', country:/g)].map((m) => m[1]),
]);
const missingPlaceTranslations = [...curatedNames].filter((name) => !translatedPlaces.has(name)).sort();
if (missingPlaceTranslations.length) {
  failures.push(`ZH/EN place translations missing: ${missingPlaceTranslations.join(', ')}`);
}

// Border UI must use the same canonical language codes as useI18n.
// QueueScreen.js is intentionally a tiny compatibility wrapper now; the
// actual driver-first implementation lives in QueueScreenCarousel.js.
const queueSrc = fs.readFileSync(path.join(ROOT, 'src', 'screens', 'QueueScreenCarousel.js'), 'utf8');
if (!/const COPY = \{[\s\S]*?\bKK:\s*\{[\s\S]*?\bZH:\s*\{/.test(queueSrc)) {
  failures.push('QueueScreen COPY does not expose canonical KK/ZH locales');
}
if (/lang === '(?:KZ|CN)'/.test(queueSrc)) {
  failures.push('QueueScreen still compares legacy KZ/CN language codes');
}

console.log(`[geo] required countries: ${REQUIRED_COUNTRIES.length}`);
console.log(`[geo] required CN↔KZ border crossings: ${REQUIRED_BORDERS.length}`);
console.log(`[geo] picker symbol checks: 5`);
console.log(`[geo] translated curated places: ${curatedNames.size}`);

if (failures.length) {
  console.log('\n[geo] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[geo] OK');
