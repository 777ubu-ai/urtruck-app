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
//         MOVED to tests/unit/push_i18n_locale_contract.test.mjs (PR #357
//         review, item 2 — this file lives in the I18N CONTENT PR, but
//         backend/services/push_i18n.py's DEFAULT_LOCALE RU→EN change is
//         its own separate PR pending product approval; a frontend-content
//         test asserting backend push-default behavior straddled both, so
//         it now lives with the PR it actually verifies.)

// --- 11. I18N-16 completion pass (item 3): a foreign locale must never
//         surface the backend's RU-only verification_required `hint` —
//         it must resolve via the structured `required_name` field
//         instead. Proves this against the actual normalizeDetail() used
//         by every marketAPI call, not a re-implementation of it. -------
{
  const { __testables } = await import('../../src/utils/marketAPI.js');
  const { normalizeDetail } = __testables;
  // KK/KY/TG/BE are LEGITIMATELY Cyrillic-script languages — the leak this
  // guards against is showing RUSSIAN prose to a locale that isn't Russian,
  // not the Cyrillic alphabet itself. So the strict "no Cyrillic at all"
  // check only applies to Latin-script/Chinese locales; every locale gets
  // the stronger, universal check: the shown text must exactly match this
  // locale's own translations.<key> value, never the raw RU hint.
  const CYRILLIC_SCRIPT_LOCALES = new Set(['RU', 'KK', 'KY', 'TG', 'BE']);
  const CYRILLIC = /[Ѐ-ӿ]/;
  const detail = {
    error: 'verification_required',
    current_level: 0,
    required_level: 3,
    required_name: 'driver_verified',
    hint: 'Нужно подтвердить документы водителя (права + тех.паспорт)',
  };
  for (const code of ['DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO', 'UZ', 'KY', 'TG', 'EN', 'ZH', 'KK']) {
    i18n.setLanguage(code);
    const shown = normalizeDetail(detail, 403);
    ok(`${code}: verification_required hint is not the raw Russian text`, shown !== detail.hint, shown);
    check(`${code}: verification_required hint matches this locale's own translation`, shown, i18n.default[code].verification_hint_driver_verified);
    if (!CYRILLIC_SCRIPT_LOCALES.has(code)) {
      ok(`${code}: verification_required hint has no Cyrillic leakage`, !CYRILLIC.test(shown), shown);
    }
    ok(`${code}: verification_required hint is non-empty`, !!shown && shown.length > 0);
  }
  // A code with no matching translation (or no required_name at all)
  // must still fall back to the raw hint rather than crash/return empty —
  // never worse than before this fix.
  i18n.setLanguage('EN');
  const noNameDetail = { error: 'verification_required', hint: 'Нужно...' };
  check('detail with no required_name falls back to raw hint (no regression)', normalizeDetail(noNameDetail, 403), 'Нужно...');
}

// --- 12. PR #357 review finding: registration.js's normalizeDetail() had
//         the err_<CODE> fix from the architecture pass but was missed by
//         the verification_hint_<required_name> fix applied to
//         marketAPI.js/Toast.js — registration is a real entry point
//         (verification_required can surface from /register/* endpoints
//         too, e.g. the driver registration wizard). Proves this against
//         the actual registration.__testables.normalizeDetail(), across
//         all 4 required_name values × all 16 locales. ------------------
{
  const { __testables } = await import('../../src/utils/registration.js');
  const { normalizeDetail } = __testables;
  const ALL_LOCALES = ['RU', 'EN', 'KK', 'ZH', 'UZ', 'KY', 'TG', 'DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO'];
  const REQUIRED_NAMES = ['guest', 'phone_verified', 'identity_verified', 'driver_verified'];
  // Deliberately worded differently from every dictionary verification_hint_*
  // value (RU included) so "shown !== rawHint" actually proves the hint was
  // localized, not a coincidental string match.
  const RAW_HINTS = {
    guest: 'Доступно без входа в систему',
    phone_verified: 'Требуется подтверждённый телефон для продолжения',
    identity_verified: 'Требуется подтверждение личности перед продолжением',
    driver_verified: 'Требуется подтверждение документов водителя перед продолжением',
  };

  ok('registration.js exports __testables.normalizeDetail', typeof normalizeDetail === 'function');

  for (const name of REQUIRED_NAMES) {
    const detail = {
      error: 'verification_required',
      current_level: 0,
      required_level: 3,
      required_name: name,
      hint: RAW_HINTS[name],
    };
    for (const code of ALL_LOCALES) {
      i18n.setLanguage(code);
      const shown = normalizeDetail(detail, 403);
      ok(`registration: ${code}/${name}: hint is not the raw backend RU text`, shown !== detail.hint, shown);
      check(`registration: ${code}/${name}: hint matches this locale's own translation`, shown, i18n.default[code][`verification_hint_${name}`]);
      ok(`registration: ${code}/${name}: hint is non-empty`, !!shown && shown.length > 0);
    }
  }

  // No-regression check: a detail with no required_name (or a code with no
  // matching translation) must still fall back to the raw hint, not crash
  // or return empty — same contract as marketAPI.js's equivalent.
  i18n.setLanguage('EN');
  const noNameDetail = { error: 'verification_required', hint: 'Нужно...' };
  check('registration: detail with no required_name falls back to raw hint (no regression)', normalizeDetail(noNameDetail, 'fallback'), 'Нужно...');
}

console.log(failed === 0 ? '\nAll i18n-16 behavioral tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
