// I18N-16 (2026-09-12): canonical locale registry.
//
// This is the SINGLE source of truth for "which locales does UrTruck
// support and what do we call them" — item 1 of the i18n expansion spec.
// Before this file existed, screens that needed to list languages (a
// future language-selector UI, settings, onboarding) would each have had
// to hardcode their own locale array, exactly the kind of duplicated-array
// drift this project's CLAUDE.md god-node warnings call out for other
// cross-cutting concerns (`get_conn()`, `useI18n()`, `useTheme()`...).
// Any UI that needs to enumerate/search/label locales — the Kimi-owned
// language selector included — should import LOCALES from here rather
// than inventing its own list.
//
// This file does NOT duplicate the translation strings or the fallback
// logic in `i18n.js` — it only describes metadata about each locale. The
// actual `translations` dictionary, `setLanguage()`, fallback-to-EN
// behaviour, persistence (`ur_lang`) and push-locale sync all continue to
// live in `i18n.js` exactly as before; this registry is consumed BY that
// logic (and by any future UI), not a replacement for it.
//
// One rule this registry encodes structurally (item 9): a locale is a
// LANGUAGE, never a country/flag. There is intentionally no `country` or
// `flagEmoji` field here — a language selector must render these by native
// name (+ optionally a transliteration for search), not by flag. Do not
// add a country/flag field to this table; render flags, if ever wanted,
// from a *separate* purely-decorative flag-icon lookup that a user can
// override, never as the thing that drives `code`.

/**
 * @typedef {Object} LocaleDescriptor
 * @property {string} code - Internal 2-letter code used as the key into
 *   `translations` in i18n.js and as the persisted `ur_lang` value.
 * @property {string} nativeName - Canonical native-script label (item 8
 *   of the i18n expansion spec — exact strings, do not reword).
 * @property {string} englishName - English/internal name, for contexts
 *   that need a Latin-script label alongside the native one (admin
 *   tooling, logs, non-native-script search).
 * @property {string} transliteration - Latin transliteration of the
 *   native name, lowercase, for search boxes that can't type Cyrillic/
 *   Uzbek-Latin-apostrophe/etc. Purely a search aid — never shown as the
 *   primary label.
 * @property {boolean} rtl - Text direction. All 16 supported locales are
 *   LTR; this field exists so a future RTL locale (Arabic, Hebrew, Farsi)
 *   doesn't require every consumer to re-derive direction from scratch.
 * @property {boolean} enabled - Whether the locale is currently offered
 *   to users. All 16 are enabled; a locale can be added to this table
 *   disabled (translation work in progress) without appearing in any
 *   selector that filters on `enabled`.
 * @property {string|null} fallback - The internal code this locale falls
 *   back to for a missing key. EN for every non-EN locale (item 2); EN
 *   itself has no further fallback (null) — it IS the universal floor.
 *   This mirrors, but does not replace, the `t()`/`translate()` runtime
 *   fallback in i18n.js — see the fallback-contract comment there for why
 *   RU is never used as an intermediate step for a non-RU locale.
 */

/** @type {LocaleDescriptor[]} */
export const LOCALES = [
  { code: 'RU', nativeName: 'Русский', englishName: 'Russian', transliteration: 'russkiy', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'EN', nativeName: 'English', englishName: 'English', transliteration: 'english', rtl: false, enabled: true, fallback: null },
  { code: 'ZH', nativeName: '中文（简体）', englishName: 'Chinese (Simplified)', transliteration: 'zhongwen', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'KK', nativeName: 'Қазақша', englishName: 'Kazakh', transliteration: 'qazaqsha', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'UZ', nativeName: "O'zbekcha", englishName: 'Uzbek', transliteration: 'ozbekcha', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'KY', nativeName: 'Кыргызча', englishName: 'Kyrgyz', transliteration: 'kyrgyzcha', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'TG', nativeName: 'Тоҷикӣ', englishName: 'Tajik', transliteration: 'tojiki', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'DE', nativeName: 'Deutsch', englishName: 'German', transliteration: 'deutsch', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'FR', nativeName: 'Français', englishName: 'French', transliteration: 'francais', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'PL', nativeName: 'Polski', englishName: 'Polish', transliteration: 'polski', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'LT', nativeName: 'Lietuvių', englishName: 'Lithuanian', transliteration: 'lietuviu', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'LV', nativeName: 'Latviešu', englishName: 'Latvian', transliteration: 'latviesu', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'IT', nativeName: 'Italiano', englishName: 'Italian', transliteration: 'italiano', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'TR', nativeName: 'Türkçe', englishName: 'Turkish', transliteration: 'turkce', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'BE', nativeName: 'Беларуская', englishName: 'Belarusian', transliteration: 'belaruskaya', rtl: false, enabled: true, fallback: 'EN' },
  { code: 'RO', nativeName: 'Română', englishName: 'Romanian', transliteration: 'romana', rtl: false, enabled: true, fallback: 'EN' },
];

/** Fast lookup by internal code, e.g. LOCALE_BY_CODE.DE.nativeName. */
export const LOCALE_BY_CODE = LOCALES.reduce((acc, l) => { acc[l.code] = l; return acc; }, {});

/** Codes of every enabled locale, in canonical display order. */
export const ENABLED_LOCALE_CODES = LOCALES.filter((l) => l.enabled).map((l) => l.code);

/**
 * Case-insensitive, diacritic-tolerant match against native name, English
 * name, transliteration or code — the synchronous local filter the i18n
 * expansion spec's SEARCH section asks for (no network search; all 16
 * locales are known upfront, so this is a plain in-memory filter). The
 * language-selector UI itself (visual design, layout) is Kimi's spec, not
 * this file's concern — this export only gives it a correct data source.
 * @param {string} query
 * @returns {LocaleDescriptor[]}
 */
export function searchLocales(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return LOCALES.filter((l) => l.enabled);
  return LOCALES.filter((l) => {
    if (!l.enabled) return false;
    return (
      l.code.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.englishName.toLowerCase().includes(q) ||
      l.transliteration.toLowerCase().includes(q)
    );
  });
}

export default LOCALES;
