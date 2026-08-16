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
 * UI-safe translator. Critical rule: Chinese UI must never silently fall back
 * to Russian. Missing ZH keys use EN as emergency fallback; QA still treats
 * any missing key on critical screens as a defect.
 */
const translate = (key) => {
  const resolvedKey = KEY_ALIASES[key] || key;
  const lang = getLanguage();
  const own = translations[lang]?.[resolvedKey];
  if (own) return own;
  if (lang === 'ZH') return translations.EN?.[resolvedKey] || resolvedKey;
  return translations.RU?.[resolvedKey] || translations.EN?.[resolvedKey] || resolvedKey;
};

// Хук для реактивного обновления текстов при смене языка
export const useI18n = () => {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    const unsub = subscribeToLanguage((l) => setLang(l));
    return () => unsub();
  }, []);

  return { t: translate, lang };
};
