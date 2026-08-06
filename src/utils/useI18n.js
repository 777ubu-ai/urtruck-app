import { useEffect, useState } from 'react';
import { t as baseT, getLanguage, subscribeToLanguage } from './i18n';

// RC1 confirmation copy reuses already-translated production keys instead of
// introducing untranslated strings in one critical flow. Keeping aliases here
// makes the confirmation text reactive in all four enabled languages.
const KEY_ALIASES = {
  confirm_mark_delivered: 'mark_arrived',
  confirm_receipt: 'confirm_delivery',
};

const t = (key, ...args) => baseT(KEY_ALIASES[key] || key, ...args);

// Хук для реактивного обновления текстов при смене языка
export const useI18n = () => {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    const unsub = subscribeToLanguage((l) => setLang(l));
    return () => unsub();
  }, []);

  return { t, lang };
};
