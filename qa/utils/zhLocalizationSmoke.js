#!/usr/bin/env node
// UrTruck ZH release gate.
// Product rule (16.08.2026): Chinese UI uses Chinese city/route names and
// never falls back to Russian system copy. User-entered free text is outside
// this static gate; system dictionaries, route catalogue and critical dialogs
// are mandatory and fail CI when incomplete.

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..', '..');
const CYR = /[А-Яа-яЁё]/;
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const failures = [];

function loadEsModule(rel) {
  const filename = path.join(ROOT, rel);
  const source = fs.readFileSync(filename, 'utf8');
  const out = babel.transformSync(source, {
    filename,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  });
  const module = { exports: {} };
  const localRequire = (id) => {
    throw new Error(`${rel}: unexpected require during ZH gate: ${id}`);
  };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', out.code)(module, module.exports, localRequire);
  return module.exports;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const places = loadEsModule('src/utils/places.js');
const geo = loadEsModule('src/utils/geography.js');

const routeCases = [
  ['Шэньчжэнь, 🇨🇳', '深圳'],
  ['Гуанчжоу, 🇨🇳', '广州'],
  ['Иу', '义乌'],
  ['Астана', '阿斯塔纳'],
  ['Алматы', '阿拉木图'],
  ['Москва', '莫斯科'],
  ['Самара', '萨马拉'],
  ['Ташкент', '塔什干'],
  ['Достык ↔ Алашанькоу', '多斯特克 ↔ 阿拉山口'],
];
for (const [raw, expected] of routeCases) {
  const actual = places.localizePlace(raw, 'ZH');
  assert(actual === expected, `route ${JSON.stringify(raw)} -> ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  assert(!CYR.test(actual), `ZH route still contains Cyrillic: ${raw} -> ${actual}`);
  assert(!FLAG.test(actual), `city value still embeds flag: ${raw} -> ${actual}`);
}

// Every selectable system geography point must resolve without Cyrillic in ZH.
const unresolved = [];
for (const point of geo.POINTS || []) {
  const raw = String(point?.name || '').trim();
  if (!raw) continue;
  const zh = String(places.localizePlace(raw, 'ZH') || '').trim();
  if (!zh || CYR.test(zh)) unresolved.push(`${raw} => ${zh || '<empty>'}`);
}
assert(unresolved.length === 0, `missing ZH geography translations (${unresolved.length}): ${unresolved.slice(0, 20).join('; ')}`);

// Every system cargo category in the central dictionary needs non-Cyrillic ZH.
const badCargo = [];
for (const [ru, entry] of Object.entries(places.CARGO_DICT || {})) {
  const zh = String(entry?.zh || '').trim();
  if (!zh || CYR.test(zh)) badCargo.push(`${ru} => ${zh || '<empty>'}`);
}
assert(badCargo.length === 0, `missing ZH cargo translations (${badCargo.length}): ${badCargo.slice(0, 20).join('; ')}`);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const useI18n = read('src/utils/useI18n.js');
const i18n = read('src/utils/i18n.js');
const dateInput = read('src/utils/dateInput.js');
const share = read('src/utils/share.js');

assert(useI18n.includes("if (lang === 'ZH') return translations.EN"), 'useI18n ZH fallback must be EN, never RU');
assert(i18n.includes("if (currentLang === 'ZH') return translations.EN"), 'global t() ZH fallback must be EN, never RU');
assert(!places.localizePlace.toString().includes("l !== 'en'"), 'localizePlace still blocks ZH localization');
assert(dateInput.includes('年${Number(month)}月${Number(day)}日'), 'ZH full date formatter missing');
assert(share.includes("ZH: { trip: 'UrTruck 行程'"), 'ZH share copy missing');
assert(share.includes("ton: '吨'"), 'ZH share ton unit missing');
assert(share.includes("volume: '立方米'"), 'ZH share volume unit missing');

// Browser/system confirm buttons inherit device locale (the exact production
// bug seen as Russian «Отменить / OK» on a Chinese UrTruck screen). Critical
// transport/deal screens must use AppConfirmModal instead.
for (const rel of [
  'src/screens/CargoDetail.js',
  'src/screens/TripDetail.js',
  'src/screens/MyTripsScreen.js',
  'src/screens/ChatScreen.js',
]) {
  const src = read(rel);
  assert(!src.includes('window.confirm'), `${rel}: window.confirm forbidden on localized product flow`);
  assert(src.includes('AppConfirmModal'), `${rel}: AppConfirmModal missing`);
}

// The exact Russian UI leaks observed in production screenshots must not be
// present as fallback literals in the affected detail/offer flow.
const critical = [read('src/screens/CargoDetail.js'), read('src/screens/TripDetail.js'), read('src/screens/ChatScreen.js')].join('\n');
for (const leak of [
  "|| 'Изменить'",
  "|| 'Моя ставка'",
  "|| 'Ожидает ответа клиента'",
  "|| 'Ожидает ответа водителя'",
  "text: 'OK'",
]) {
  assert(!critical.includes(leak), `critical ZH fallback leak remains: ${leak}`);
}

console.log(`[zh] route fixtures: ${routeCases.length}`);
console.log(`[zh] geography points checked: ${(geo.POINTS || []).length}`);
console.log(`[zh] cargo dictionary entries checked: ${Object.keys(places.CARGO_DICT || {}).length}`);
console.log('[zh] critical dialog files checked: 4');

if (failures.length) {
  console.error('\n[zh] FAIL');
  failures.forEach((f) => console.error('  -', f));
  process.exit(1);
}
console.log('\n[zh] OK — known system routes/cities/categories and critical dialogs are Chinese-safe');
