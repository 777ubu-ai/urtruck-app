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

// 6. EN aliases for the most-used logistics nodes — the picker
// supports search across aliases, so the absence of an English
// alias means a foreign user can't find the entry by typing
// "Khorgos" / "Malaszewicze" / "Alashankou".
const REQUIRED_ALIASES = {
  Хоргос: 'Khorgos',
  Алашанькоу: 'Alashankou',
  Достык: 'Dostyk',
  Малашевичи: 'Malaszewicze',
};
for (const [name, alias] of Object.entries(REQUIRED_ALIASES)) {
  // Find the line containing the name and verify the alias appears
  // on the same line (each entry is one line).
  const linePattern = new RegExp(`'${name}'[^\\n]*?'${alias}'`);
  if (!linePattern.test(src)) {
    failures.push(`'${name}' missing English alias '${alias}'`);
  }
}

// 7. Picker free-text fallback inherits country (Stage 7 finalisation).
if (!/inferCountryFromQuery/.test(pickerSrc)) {
  failures.push('RoutePointPicker free-text fallback no longer infers country');
}
if (/onChange\?\.\(trimmed,\s*\{\s*name:\s*trimmed,\s*country:\s*'XX'/.test(pickerSrc)) {
  failures.push('RoutePointPicker still hard-codes country=XX in free-text fallback');
}

// 8. Stage 8: every required country has a localised name in all
// four enabled languages. The picker reads `country_<CODE>` so a
// missing entry would fall back to the Russian-only `COUNTRIES`
// table — visible regression for EN/KK/ZH users.
const I18N_PATH = path.join(ROOT, 'src', 'utils', 'i18n.js');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
for (const code of REQUIRED_COUNTRIES) {
  for (const lang of ['RU', 'EN', 'KK', 'ZH']) {
    // Scope check to the language block to avoid cross-block matches
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

// 9. Picker uses localisedCountryName (Stage 8) rather than the bare
// COUNTRIES[code].name in the JSX it renders.
if (!/localisedCountryName/.test(pickerSrc)) {
  failures.push('RoutePointPicker no longer uses localisedCountryName helper');
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
