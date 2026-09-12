import { useEffect, useState } from 'react';
import translations, { getLanguage, subscribeToLanguage } from './i18n';

// RC1 confirmation copy reuses already-translated production keys instead of
// introducing untranslated strings in one critical flow. Keeping aliases here
// makes the confirmation text reactive in all four enabled languages.
const KEY_ALIASES = {
  confirm_mark_delivered: 'mark_arrived',
  confirm_receipt: 'confirm_delivery',
};

/**
 * UI-safe translator. Critical rule: a non-Russian locale must never silently
 * fall back to Russian. Missing non-RU keys use EN as an emergency fallback;
 * QA still treats missing keys on critical screens as a defect.
 */
const translate = (key) => {
  const resolvedKey = KEY_ALIASES[key] || key;
  const lang = getLanguage();
  const own = translations[lang]?.[resolvedKey];
  if (own) return own;
  if (lang !== 'RU') return translations.EN?.[resolvedKey] || resolvedKey;
  return translations.RU?.[resolvedKey] || translations.EN?.[resolvedKey] || resolvedKey;
};

// CJK legibility floor (Design v1 Commit 7): Chinese glyphs are dense —
// below 12sp they blur on device. `sp(size)` raises any font size to 12 when
// the active UI language is ZH; other languages get the design value as-is.
// Exported standalone so theme-adjacent style factories (not just components)
// can apply the same rule.
export const spFor = (lang, size) => (lang === 'ZH' ? Math.max(Number(size) || 0, 12) : size);

// Хук для реактивного обновления текстов при смене языка
export const useI18n = () => {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    const unsub = subscribeToLanguage((l) => setLang(l));
    return () => unsub();
  }, []);

  return { t: translate, lang, sp: (size) => spFor(lang, size) };
};
