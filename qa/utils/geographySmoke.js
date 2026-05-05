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
  // Russian text — escape for regex by literal contains
  if (!src.includes(name)) failures.push(`border '${name}' missing from POINTS`);
}

// 4. Малашевичи
if (!src.includes('Малашевичи')) failures.push("'Малашевичи' missing from POINTS");

// 5. Picker imports registry helpers
const pickerSrc = fs.readFileSync(PICKER, 'utf8');
for (const sym of ['COUNTRIES', 'POINT_TYPES', 'searchPoints', 'formatPoint', 'pointsForCountry']) {
  if (!new RegExp(`\\b${sym}\\b`).test(pickerSrc)) failures.push(`RoutePointPicker doesn't reference ${sym}`);
}

console.log(`[geo] required countries: ${REQUIRED_COUNTRIES.length}`);
console.log(`[geo] required CN↔KZ border crossings: ${REQUIRED_BORDERS.length}`);
console.log(`[geo] picker symbol checks: 5`);

if (failures.length) {
  console.log('\n[geo] FAIL:');
  failures.forEach((f) => console.log('  -', f));
  process.exit(1);
}
console.log('\n[geo] OK');
