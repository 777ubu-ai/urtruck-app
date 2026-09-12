#!/usr/bin/env node
// UrTruck i18n-16 completeness gate (feat/claude-i18n-16-locales-20260912).
//
// Item 10 of the i18n expansion spec: an automated check that, for every
// canonical key, all ENABLED locales contain a value OR explicitly inherit
// through the approved EN fallback (never a silent gap, never a silent
// fallback to Russian). Explicitly NOT a naive "all values must differ"
// rule — a value that legitimately matches across locales (an acronym like
// "GPS"/"SMS", a shared proper noun, a short technical term) is fine; this
// gate only flags empty/missing/placeholder-marker values as hard errors,
// and reports same-as-EN matches as an informational list for a human to
// skim, never as a failure.
//
// CORE_KEYS is derived, not hand-copied: it is the set of keys present in
// every one of the 12 newly-added locale dictionaries (UZ/KY/TG/DE/FR/PL/
// LT/LV/IT/TR/BE/RO). Those 12 blocks were authored together against one
// bounded key list spanning auth, registration, statuses/FSM, cargo types,
// gates, validation, photo/voice, errors, navigation, filters, chat/
// attachments, GPS/map and push settings (i18n expansion spec item 5's
// category list) — see the "I18N-16" comment above the UZ block in
// src/utils/i18n.js. Keys OUTSIDE this set exist only in the four
// pre-existing locales (RU/EN/KK/ZH) and are expected to resolve for the
// 12 new locales via the existing EN-fallback contract in t()/translate()
// — this gate does not, and must not, flag those as "missing".

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..', '..');
const failures = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const NEW_LOCALES = ['UZ', 'KY', 'TG', 'DE', 'FR', 'PL', 'LT', 'LV', 'IT', 'TR', 'BE', 'RO'];
const ORIGINAL_LOCALES = ['RU', 'EN', 'KK', 'ZH'];
const ALL_LOCALES = [...ORIGINAL_LOCALES, ...NEW_LOCALES];

// Item 8 — canonical native labels, verbatim. A mismatch here is a hard
// failure: these strings are the product's contractual language names.
const CANONICAL_NATIVE_NAMES = {
  RU: 'Русский',
  EN: 'English',
  ZH: '中文（简体）',
  KK: 'Қазақша',
  UZ: "O'zbekcha",
  KY: 'Кыргызча',
  TG: 'Тоҷикӣ',
  DE: 'Deutsch',
  FR: 'Français',
  PL: 'Polski',
  LT: 'Lietuvių',
  LV: 'Latviešu',
  IT: 'Italiano',
  TR: 'Türkçe',
  BE: 'Беларуская',
  RO: 'Română',
};

const PLACEHOLDER_MARKERS = /\b(TODO|TRANSLATE|FIXME|XXX|LOREM IPSUM)\b/i;

(async () => {
  const i18nUrl = pathToFileURL(path.join(ROOT, 'src/utils/i18n.js')).href;
  const translations = (await import(i18nUrl)).default;

  const registryUrl = pathToFileURL(path.join(ROOT, 'src/utils/localeRegistry.js')).href;
  const { LOCALES, LOCALE_BY_CODE, ENABLED_LOCALE_CODES } = await import(registryUrl);

  // --- Registry shape -------------------------------------------------
  assert(LOCALES.length === 16, `expected 16 registry entries, got ${LOCALES.length}`);
  assert(ENABLED_LOCALE_CODES.length === 16, `expected 16 enabled locales, got ${ENABLED_LOCALE_CODES.length}`);
  for (const code of ALL_LOCALES) {
    const entry = LOCALE_BY_CODE[code];
    assert(entry, `registry missing entry for ${code}`);
    if (!entry) continue;
    assert(entry.rtl === false, `${code}: rtl must be false (all 16 supported locales are LTR)`);
    assert(entry.enabled === true, `${code}: must be enabled`);
    assert(
      entry.nativeName === CANONICAL_NATIVE_NAMES[code],
      `${code}: nativeName "${entry.nativeName}" !== canonical "${CANONICAL_NATIVE_NAMES[code]}"`
    );
    if (code === 'EN') {
      assert(entry.fallback === null, `EN fallback must be null (it is the universal floor)`);
    } else {
      assert(entry.fallback === 'EN', `${code}: fallback must be "EN" (never RU) — item 2/item 9`);
    }
    assert(!('country' in entry) && !('flagEmoji' in entry), `${code}: registry must not couple locale to country/flag (item 9)`);
  }

  // --- translations object has exactly these 16 blocks ----------------
  const dictCodes = Object.keys(translations);
  for (const code of ALL_LOCALES) {
    assert(translations[code], `translations.${code} block missing from i18n.js`);
  }
  assert(dictCodes.length === 16, `expected exactly 16 locale blocks in translations, got ${dictCodes.length}: ${dictCodes.join(',')}`);

  // --- derive CORE_KEYS from the 12 new locales (intersection) --------
  let coreKeys = null;
  for (const code of NEW_LOCALES) {
    const keys = new Set(Object.keys(translations[code] || {}));
    coreKeys = coreKeys === null ? keys : new Set([...coreKeys].filter((k) => keys.has(k)));
  }
  coreKeys = coreKeys || new Set();
  assert(coreKeys.size > 0, 'derived CORE_KEYS set is empty — new locale blocks missing or malformed');

  // Every new locale must have EXACTLY coreKeys (no partial coverage, no
  // silently-narrower locale) — a locale with fewer keys than the
  // intersection would be a contradiction, so this really checks equality.
  for (const code of NEW_LOCALES) {
    const keys = new Set(Object.keys(translations[code] || {}));
    assert(keys.size === coreKeys.size, `${code}: has ${keys.size} CORE_KEYS entries, expected ${coreKeys.size}`);
  }

  // --- per-locale value quality for CORE_KEYS --------------------------
  const identicalToEn = [];
  let emptyCount = 0;
  let placeholderCount = 0;
  for (const code of ALL_LOCALES) {
    const dict = translations[code] || {};
    for (const key of coreKeys) {
      const val = dict[key];
      assert(key in dict, `${code}.${key}: missing (must be present or the key must not be in CORE_KEYS)`);
      if (val === undefined) continue;
      const trimmed = String(val).trim();
      if (!trimmed) {
        failures.push(`${code}.${key}: empty value`);
        emptyCount++;
        continue;
      }
      if (PLACEHOLDER_MARKERS.test(trimmed)) {
        failures.push(`${code}.${key}: looks like an untranslated placeholder ("${trimmed}")`);
        placeholderCount++;
        continue;
      }
      if (code !== 'EN' && code !== 'RU' && translations.EN?.[key] === val) {
        // Informational only (item 10 explicitly forbids a naive
        // "must differ" rule) — legitimate matches happen (GPS, SMS,
        // brand names, city names in Latin script, etc).
        identicalToEn.push(`${code}.${key} === EN ("${val}")`);
      }
    }
  }

  // --- placeholder-interpolation parity (a translated string must keep
  // the same {named} placeholders as its RU source, or the app will
  // either crash formatting it or silently drop the interpolated value)
  const PH = (s) => new Set((String(s).match(/\{[a-zA-Z_]+\}/g) || []));
  const setsEqual = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  for (const key of coreKeys) {
    const ref = PH(translations.RU?.[key] || '');
    for (const code of ALL_LOCALES) {
      const val = translations[code]?.[key];
      if (val === undefined) continue;
      const got = PH(val);
      assert(setsEqual(ref, got), `${code}.${key}: placeholder mismatch — expected ${[...ref]}, got ${[...got]}`);
    }
  }

  console.log(`[i18n-16] registry entries: ${LOCALES.length}`);
  console.log(`[i18n-16] locales checked: ${ALL_LOCALES.join(', ')}`);
  console.log(`[i18n-16] CORE_KEYS (derived): ${coreKeys.size}`);
  console.log(`[i18n-16] empty values: ${emptyCount}`);
  console.log(`[i18n-16] placeholder-marker values: ${placeholderCount}`);
  console.log(`[i18n-16] informational same-as-EN matches: ${identicalToEn.length} (not a failure — item 10)`);
  if (identicalToEn.length && process.env.I18N_VERBOSE) {
    identicalToEn.forEach((l) => console.log('  ~', l));
  }

  if (failures.length) {
    console.error(`\n[i18n-16] FAIL (${failures.length})`);
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }
  console.log('\n[i18n-16] OK — 16-locale registry + CORE_KEYS coverage verified, 0 missing/empty/placeholder, 0 placeholder-interpolation mismatches');
})().catch((error) => {
  console.error('[i18n-16] loader/runtime failure:', error);
  process.exit(1);
});
