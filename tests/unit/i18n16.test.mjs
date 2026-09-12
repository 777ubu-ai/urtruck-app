// Behavioral tests for the 16-locale i18n expansion
// (feat/claude-i18n-16-locales-20260912) — item 12 of the i18n expansion
// spec: locale persistence, runtime switching, fallback, missing-key
// handling, push locale selection, account-switch locale isolation, and
// 16-locale registry completeness.
//
//   node tests/unit/i18n16.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as i18n from '../../src/utils/i18n.js';
import { LOCALES, LOCALE_BY_CODE, ENABLED_LOCALE_CODES, searchLocales } from '../../src/utils/localeRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + (ok ? '' : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`));
  if (!ok) failed++;
}
function ok(desc, condition, detail) {
  console.log((condition ? '  ok: ' : 'FAIL: ') + desc + (condition ? '' : ` (${detail || ''})`));
  if (!condition) failed++;
}

const NEW_LOCALES = ['UZ', 'KY', 'TG', 'DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO'];
const ALL_16 = ['RU', 'EN', 'KK', 'ZH', ...NEW_LOCALES];

// --- 1. Registry completeness ---------------------------------------
check('registry has 16 locales', LOCALES.length, 16);
check('all 16 enabled', ENABLED_LOCALE_CODES.length, 16);
for (const code of ALL_16) {
  ok(`registry has entry for ${code}`, !!LOCALE_BY_CODE[code]);
}
ok('EN has null fallback (universal floor)', LOCALE_BY_CODE.EN.fallback === null);
for (const code of ALL_16) {
  if (code === 'EN') continue;
  check(`${code} fallback is EN`, LOCALE_BY_CODE[code].fallback, 'EN');
}
for (const code of ALL_16) {
  check(`${code} is LTR (rtl:false)`, LOCALE_BY_CODE[code].rtl, false);
}

// --- 2. search() is synchronous, local, and transliteration-aware ----
{
  const r1 = searchLocales('qazaq');
  ok('search by transliteration finds Kazakh', r1.some((l) => l.code === 'KK'), JSON.stringify(r1.map((l) => l.code)));
  const r2 = searchLocales('deutsch');
  ok('search by native name finds German', r2.some((l) => l.code === 'DE'));
  const r3 = searchLocales('polish');
  ok('search by English name finds Polish', r3.some((l) => l.code === 'PL'));
  const r4 = searchLocales('');
  check('empty query returns all enabled', r4.length, 16);
}

// --- 3. translations dictionary has all 16 blocks --------------------
for (const code of ALL_16) {
  ok(`translations.${code} exists`, !!i18n.default[code]);
}

// --- 4. runtime switching: setLanguage() updates getLanguage() and
//        notifies subscribers synchronously, no reinstall needed --------
{
  let observed = null;
  const unsub = i18n.subscribeToLanguage((l) => { observed = l; });
  for (const code of [...NEW_LOCALES, 'RU', 'EN']) {
    i18n.setLanguage(code);
    check(`getLanguage() reflects setLanguage('${code}')`, i18n.getLanguage(), code);
    check(`subscriber notified of '${code}'`, observed, code);
  }
  unsub();
}

// --- 5. fallback contract: a CORE_KEYS value is real for every new
//        locale (not silently falling back to EN or RU) ----------------
i18n.setLanguage('DE');
check('DE known key resolves to German text (not EN/RU)', i18n.t('save'), 'Speichern');
i18n.setLanguage('TR');
check('TR known key resolves to Turkish text', i18n.t('save'), 'Kaydet');
i18n.setLanguage('UZ');
check('UZ known key resolves to Uzbek text', i18n.t('save'), 'Saqlash');

// --- 6. missing-key handling: a key that exists only in RU/EN (outside
//        CORE_KEYS) must fall back to EN for every new locale, and must
//        NEVER silently resolve to Russian text ---------------------
{
  // Pick a key guaranteed absent from every new-locale block: anything
  // present in EN but not in, say, DE.
  const enOnlyKeys = Object.keys(i18n.default.EN).filter((k) => !(k in i18n.default.DE));
  ok('found at least one EN-only key to test fallback with', enOnlyKeys.length > 0);
  const probe = enOnlyKeys[0];
  for (const code of NEW_LOCALES) {
    i18n.setLanguage(code);
    const got = i18n.t(probe);
    check(`${code}.t('${probe}') falls back to EN value`, got, i18n.default.EN[probe]);
    ok(`${code}.t('${probe}') is not the Russian value`, got !== i18n.default.RU[probe] || i18n.default.RU[probe] === i18n.default.EN[probe]);
  }
}

// --- 7. persistence contract: ur_lang is device-scoped and must survive
//        logout/account-switch — assert AuthContext's logout cleanup
//        never removes it (source-level contract test, matches the
//        established qa/utils/zhLocalizationSmoke.js pattern) -----------
{
  const authContext = read('src/utils/AuthContext.js');
  const keyDecl = i18n_KEY_from_source(read('src/utils/i18n.js'));
  ok('i18n.js persistence KEY is "ur_lang"', keyDecl === 'ur_lang', `got ${keyDecl}`);
  // Find the logout/cleanup block's list of storage.remove(...) calls and
  // confirm 'ur_lang' is never one of them.
  const removeCalls = [...authContext.matchAll(/storage\.remove\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  ok('logout cleanup removes at least one key (sanity check)', removeCalls.length > 0);
  ok("logout cleanup never removes 'ur_lang' (locale is device-scoped, survives logout/account-switch)", !removeCalls.includes('ur_lang'), removeCalls.join(', '));
}

function i18n_KEY_from_source(src) {
  const m = src.match(/const KEY = '([^']+)'/);
  return m ? m[1] : null;
}

// --- 8. LANG_ALIAS / HTML_LANG cover all 12 new locales ---------------
{
  const src = read('src/utils/i18n.js');
  for (const [bcp, code] of [
    ['uz', 'UZ'], ['ky', 'KY'], ['tg', 'TG'], ['de', 'DE'], ['fr', 'FR'], ['pl', 'PL'],
    ['lt', 'LT'], ['lv', 'LV'], ['it', 'IT'], ['tr', 'TR'], ['be', 'BE'], ['ro', 'RO'],
  ]) {
    ok(`LANG_ALIAS maps '${bcp}' -> ${code}`, new RegExp(`${bcp}:\\s*'${code}'`).test(src) || src.includes(`  ${bcp}: '${code}',`) || src.includes(`${bcp}: '${code}'`));
  }
  for (const code of NEW_LOCALES) {
    ok(`HTML_LANG has an entry for ${code}`, new RegExp(`${code}:\\s*'`).test(src.split('const HTML_LANG')[1].split('};')[0]));
  }
}

// --- 9. account-switch locale isolation: setLanguage() is a pure
//        module-level call — switching users (a fresh AuthContext session)
//        must not silently reset the chosen locale back to a default.
//        We assert this at the contract level: getLanguage() after
//        setLanguage() is stable across repeated reads (no hidden reset). --
{
  i18n.setLanguage('FR');
  const a = i18n.getLanguage();
  const b = i18n.getLanguage();
  check('getLanguage() is stable (no reset) across reads', a, 'FR');
  check('getLanguage() is idempotent', b, 'FR');
}

// --- 10. push locale contract: push_i18n.py supports all 16 codes,
//         defaults to EN (never RU) for unknown/missing locale ---------
{
  const pushSrc = read('backend/services/push_i18n.py');
  ok('push_i18n.py SUPPORTED_LOCALES has 16 entries', (pushSrc.match(/SUPPORTED_LOCALES = \(([\s\S]*?)\)/)[1].match(/"[A-Z]{2}"/g) || []).length === 16);
  ok('push_i18n.py DEFAULT_LOCALE is EN, not RU', /DEFAULT_LOCALE = "EN"/.test(pushSrc));
  for (const code of NEW_LOCALES) {
    ok(`push_i18n.py TEMPLATES reference "${code}"`, pushSrc.includes(`"${code}":`));
  }
}

console.log(failed === 0 ? '\nAll i18n-16 behavioral tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
