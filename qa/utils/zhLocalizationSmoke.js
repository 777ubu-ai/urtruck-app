#!/usr/bin/env node
// UrTruck ZH release gate.
// Product rule (16.08.2026): Chinese UI uses Chinese city/route names and
// never falls back to Russian system copy. User-entered free text is outside
// this static gate; system dictionaries, route catalogue and critical dialogs
// are mandatory and fail CI when incomplete.

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const CYR = /[А-Яа-яЁё]/;
const FLAG = /[\u{1F1E6}-\u{1F1FF}]{2}/u;
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const importSourceModule = async (rel) => {
  const url = pathToFileURL(path.join(ROOT, rel)).href;
  return import(url);
};

(async () => {
  const places = await importSourceModule('src/utils/places.js');
  const geo = await importSourceModule('src/utils/geography.js');

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

  const unresolved = [];
  for (const point of geo.POINTS || []) {
    const raw = String(point?.name || '').trim();
    if (!raw) continue;
    const zh = String(places.localizePlace(raw, 'ZH') || '').trim();
    if (!zh || CYR.test(zh)) unresolved.push(`${raw} => ${zh || '<empty>'}`);
  }
  assert(unresolved.length === 0, `missing ZH geography translations (${unresolved.length}): ${unresolved.slice(0, 30).join('; ')}`);

  const badCargo = [];
  for (const [ru, entry] of Object.entries(places.CARGO_DICT || {})) {
    const zh = String(entry?.zh || '').trim();
    if (!zh || CYR.test(zh)) badCargo.push(`${ru} => ${zh || '<empty>'}`);
  }
  assert(badCargo.length === 0, `missing ZH cargo translations (${badCargo.length}): ${badCargo.slice(0, 30).join('; ')}`);

  const useI18n = read('src/utils/useI18n.js');
  const i18n = read('src/utils/i18n.js');
  const dateInput = read('src/utils/dateInput.js');
  const share = read('src/utils/share.js');

  assert(useI18n.includes("if (lang === 'ZH') return translations.EN"), 'useI18n ZH fallback must be EN, never RU');
  assert(i18n.includes("if (currentLang === 'ZH') return translations.EN"), 'global t() ZH fallback must be EN, never RU');
  assert(!places.localizePlace.toString().includes("l !== 'en'"), 'localizePlace still blocks ZH localization');
  assert(dateInput.includes('年${Number(year)}年') === false, 'broken duplicated ZH year marker');
  assert(dateInput.includes('年${Number(month)}月${Number(day)}日'), 'ZH full date formatter missing');
  assert(share.includes("ZH: { trip: 'UrTruck 行程'"), 'ZH share copy missing');
  assert(share.includes("ton: '吨'"), 'ZH share ton unit missing');
  assert(share.includes("volume: '立方米'"), 'ZH share volume unit missing');

  const criticalDialogFiles = [
    'src/screens/CargoDetail.js',
    'src/screens/TripDetail.js',
    'src/screens/MyTripsScreen.js',
    'src/screens/ChatScreen.js',
    'src/screens/ProfileScreen.js',
    'src/screens/EditProfileScreen.js',
  ];
  for (const rel of criticalDialogFiles) {
    const src = read(rel);
    assert(!src.includes('window.confirm('), `${rel}: window.confirm() forbidden on localized product flow`);
    assert(src.includes('AppConfirmModal'), `${rel}: AppConfirmModal missing`);
  }

  const profile = read('src/screens/ProfileScreen.js');
  const editProfile = read('src/screens/EditProfileScreen.js');
  assert(profile.includes('localizePlace(profile.city, uiLang)'), 'Profile city is not localized');
  assert(editProfile.includes('localizePlace(b, lang)'), 'EditProfile border chips are not localized');

  const critical = [
    read('src/screens/CargoDetail.js'),
    read('src/screens/TripDetail.js'),
    read('src/screens/ChatScreen.js'),
    profile,
    editProfile,
  ].join('\n');
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
  console.log(`[zh] critical dialog files checked: ${criticalDialogFiles.length}`);

  if (failures.length) {
    console.error('\n[zh] FAIL');
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }
  console.log('\n[zh] OK — known system routes/cities/categories, profile geography and critical dialogs are Chinese-safe');
})().catch((error) => {
  console.error('[zh] loader/runtime failure:', error);
  process.exit(1);
});
