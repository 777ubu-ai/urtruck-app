import { useEffect, useState } from 'react';
import { t, getLanguage, subscribeToLanguage } from './i18n';

// Хук для реактивного обновления текстов при смене языка
export const useI18n = () => {
  const [lang, setLang] = useState(getLanguage());

  useEffect(() => {
    const unsub = subscribeToLanguage((l) => setLang(l));
    return () => unsub();
  }, []);

  return { t, lang };
};
