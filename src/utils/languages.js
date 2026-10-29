// Код языка и код страны различаются: KY/KG, TG/TJ, BE/BY, KK/KZ, ZH/CN.
export const LANGUAGES = Object.freeze([
  { code: 'RU', display: 'RU', label: 'Русский', country: 'RU', locale: 'ru-RU' },
  { code: 'KK', display: 'KZ', label: 'Қазақша', country: 'KZ', locale: 'kk-KZ' },
  { code: 'EN', display: 'EN', label: 'English', country: 'GB', locale: 'en-GB' },
  { code: 'ZH', display: 'CN', label: '中文', country: 'CN', locale: 'zh-CN' },
  { code: 'TR', display: 'TR', label: 'Türkçe', country: 'TR', locale: 'tr-TR' },
  { code: 'UZ', display: 'UZ', label: 'O‘zbekcha', country: 'UZ', locale: 'uz-UZ' },
  { code: 'KY', display: 'KY', label: 'Кыргызча', country: 'KG', locale: 'ky-KG' },
  { code: 'TG', display: 'TG', label: 'Тоҷикӣ', country: 'TJ', locale: 'tg-TJ' },
  { code: 'BE', display: 'BE', label: 'Беларуская', country: 'BY', locale: 'be-BY' },
]);

export const ADDITIONAL_LANGUAGE_CODES = Object.freeze(['TR', 'UZ', 'KY', 'TG', 'BE']);
export const localeForLanguage = (code) => LANGUAGES.find(l => l.code === String(code).toUpperCase())?.locale || 'en-GB';
