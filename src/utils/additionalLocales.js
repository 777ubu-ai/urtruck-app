import tr from './locales/tr.js';
import uz from './locales/uz.js';
import ky from './locales/ky.js';
import tg from './locales/tg.js';
import be from './locales/be.js';
import { ADDITIONAL_LANGUAGE_CODES, localeForLanguage } from './languages.js';

const catalogs = { TR: tr, UZ: uz, KY: ky, TG: tg, BE: be };
export const ADDITIONAL_TRANSLATIONS = Object.fromEntries(
  ADDITIONAL_LANGUAGE_CODES.map(code => [code, catalogs[code].common]),
);

// Только статические строки интерфейса. Пользовательские сообщения и данные
// через этот адаптер не переводятся и не отправляются во внешние сервисы.
export function localizeUiText(value, language) {
  const code = String(language).toUpperCase();
  const catalog = catalogs[code];
  if (!catalog || typeof value !== 'string' || !value.trim()) return value;
  if (/^(?:ru|en|kk|zh)-(?:RU|US|GB|KZ|CN)$/.test(value)) return localeForLanguage(code);
  return catalog.phrases[value] ?? value;
}

export function localizeUiTemplate(parts, values, language) {
  const key = parts.map((part, index) => part + (index < values.length ? `{_v${index}}` : '')).join('');
  return localizeUiText(key, language).replace(/\{_v(\d+)\}/g, (_, index) => String(values[Number(index)]));
}

const expanded = new WeakMap();
// Существующие RU/KK/EN/ZH объекты сохраняются без изменения. Новые языки
// используют тот же набор полей, включая вложенные формы и календарные массивы.
export function withAdditionalLanguages(copy) {
  if (expanded.has(copy)) return expanded.get(copy);
  const base = copy.RU ?? copy.EN;
  if (base == null) return copy;
  const visit = (value, code) => {
    if (Array.isArray(value)) return value.map(item => visit(item, code));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, code)]));
    if (typeof value === 'function') return (...args) => localizeUiText(value(...args), code);
    return localizeUiText(value, code);
  };
  const result = { ...copy };
  for (const code of ADDITIONAL_LANGUAGE_CODES) result[code] = visit(base, code);
  expanded.set(copy, result);
  return result;
}

// Подключение к уже существующим именованным словарям без переписывания их
// исходных четырёх локалей и без потери вложенных карт статусов/типов кузова.
export function withAdditionalLanguageTree(value) {
  if (!value || typeof value !== 'object') return value;
  if (('RU' in value && 'EN' in value) || ('EN' in value && 'KK' in value && 'ZH' in value)) return withAdditionalLanguages(value);
  if (Array.isArray(value)) return value.map(withAdditionalLanguageTree);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withAdditionalLanguageTree(item)]));
}
