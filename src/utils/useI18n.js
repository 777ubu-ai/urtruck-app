import { useEffect, useState } from 'react';
import { t, getLanguage, subscribeToLanguage } from './i18n';

// Хук для реактивного обновления текстов при смене языка
export const useI18n = () => {
  const [, setLang] = useState(getLanguage());

  useEffect(() => {
    const unsub = subscribeToLanguage((lang) => setLang(lang));
    return () => unsub();
  }, []);

  return { t };
};
