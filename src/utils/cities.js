// Города по странам с координатами
export const COUNTRIES = {
  KZ: { flag: '🇰🇿', name: 'Казахстан' },
  RU: { flag: '🇷🇺', name: 'Россия' },
  UZ: { flag: '🇺🇿', name: 'Узбекистан' },
  KG: { flag: '🇰🇬', name: 'Кыргызстан' },
  CN: { flag: '🇨🇳', name: 'Китай' },
  TJ: { flag: '🇹🇯', name: 'Таджикистан' },
  TM: { flag: '🇹🇲', name: 'Туркменистан' },
  GE: { flag: '🇬🇪', name: 'Грузия' },
  BY: { flag: '🇧🇾', name: 'Беларусь' },
  AM: { flag: '🇦🇲', name: 'Армения' },
  AZ: { flag: '🇦🇿', name: 'Азербайджан' },
  TR: { flag: '🇹🇷', name: 'Турция' },
  DE: { flag: '🇩🇪', name: 'Германия' },
  PL: { flag: '🇵🇱', name: 'Польша' },
  AE: { flag: '🇦🇪', name: 'ОАЭ' },
};

const BASE_CITIES = [
  // Казахстан (погран-переходы и крупные города)
  { name: 'Алматы', country: 'KZ' }, { name: 'Астана', country: 'KZ' },
  { name: 'Шымкент', country: 'KZ' }, { name: 'Караганда', country: 'KZ' },
  { name: 'Актобе', country: 'KZ' }, { name: 'Атырау', country: 'KZ' },
  { name: 'Усть-Каменогорск', country: 'KZ' }, { name: 'Павлодар', country: 'KZ' },
  { name: 'Семей', country: 'KZ' }, { name: 'Тараз', country: 'KZ' },
  { name: 'Костанай', country: 'KZ' }, { name: 'Кызылорда', country: 'KZ' },
  { name: 'Уральск', country: 'KZ' }, { name: 'Актау', country: 'KZ' },
  { name: 'Петропавловск', country: 'KZ' }, { name: 'Кокшетау', country: 'KZ' },
  { name: 'Хоргос', country: 'KZ' }, { name: 'Достык', country: 'KZ' },
  { name: 'Калжат', country: 'KZ' }, { name: 'Бахты', country: 'KZ' },
  { name: 'Қарасу', country: 'KZ' }, { name: 'Талдыкорган', country: 'KZ' },
  // Россия
  { name: 'Москва', country: 'RU' }, { name: 'Санкт-Петербург', country: 'RU' },
  { name: 'Новосибирск', country: 'RU' }, { name: 'Екатеринбург', country: 'RU' },
  { name: 'Казань', country: 'RU' }, { name: 'Нижний Новгород', country: 'RU' },
  { name: 'Челябинск', country: 'RU' }, { name: 'Самара', country: 'RU' },
  { name: 'Омск', country: 'RU' }, { name: 'Уфа', country: 'RU' },
  { name: 'Красноярск', country: 'RU' }, { name: 'Воронеж', country: 'RU' },
  { name: 'Волгоград', country: 'RU' }, { name: 'Ростов-на-Дону', country: 'RU' },
  { name: 'Краснодар', country: 'RU' }, { name: 'Иркутск', country: 'RU' },
  { name: 'Владивосток', country: 'RU' }, { name: 'Хабаровск', country: 'RU' },
  { name: 'Оренбург', country: 'RU' }, { name: 'Сочи', country: 'RU' },
  // Китай — все основные города для грузоперевозок
  { name: 'Иу', country: 'CN' }, { name: 'Гуанчжоу', country: 'CN' },
  { name: 'Шэньчжэнь', country: 'CN' }, { name: 'Пекин', country: 'CN' },
  { name: 'Шанхай', country: 'CN' }, { name: 'Ханчжоу', country: 'CN' },
  { name: 'Урумчи', country: 'CN' }, { name: 'Хоргос (Хуэйэрго)', country: 'CN' },
  { name: 'Алашанькоу', country: 'CN' }, { name: 'Кашгар', country: 'CN' },
  { name: 'Дулаты', country: 'CN' },
  { name: 'Циндао', country: 'CN' }, { name: 'Чэнду', country: 'CN' },
  { name: 'Чунцин', country: 'CN' }, { name: 'Тяньцзинь', country: 'CN' },
  { name: 'Сиань', country: 'CN' }, { name: 'Ланьчжоу', country: 'CN' },
  { name: 'Иньчуань', country: 'CN' }, { name: 'Хух-Хото', country: 'CN' },
  { name: 'Нинбо', country: 'CN' }, { name: 'Циньхуандао', country: 'CN' },
  // Узбекистан
  { name: 'Ташкент', country: 'UZ' }, { name: 'Самарканд', country: 'UZ' },
  { name: 'Бухара', country: 'UZ' }, { name: 'Андижан', country: 'UZ' },
  { name: 'Наманган', country: 'UZ' }, { name: 'Фергана', country: 'UZ' },
  { name: 'Нукус', country: 'UZ' }, { name: 'Термез', country: 'UZ' },
  { name: 'Карши', country: 'UZ' },
  // Кыргызстан
  { name: 'Бишкек', country: 'KG' }, { name: 'Ош', country: 'KG' },
  { name: 'Каракол', country: 'KG' }, { name: 'Нарын', country: 'KG' },
  { name: 'Токмок', country: 'KG' },
  // Таджикистан
  { name: 'Душанбе', country: 'TJ' }, { name: 'Худжанд', country: 'TJ' },
  { name: 'Куляб', country: 'TJ' },
  // Туркменистан
  { name: 'Ашхабад', country: 'TM' }, { name: 'Туркменабад', country: 'TM' },
  // Грузия
  { name: 'Тбилиси', country: 'GE' }, { name: 'Батуми', country: 'GE' },
  // Беларусь
  { name: 'Минск', country: 'BY' }, { name: 'Брест', country: 'BY' },
  // Армения, Азербайджан
  { name: 'Ереван', country: 'AM' }, { name: 'Баку', country: 'AZ' },
  // Турция
  { name: 'Стамбул', country: 'TR' }, { name: 'Анкара', country: 'TR' },
  { name: 'Измир', country: 'TR' }, { name: 'Мерсин', country: 'TR' },
  // Германия
  { name: 'Гамбург', country: 'DE' }, { name: 'Берлин', country: 'DE' },
  { name: 'Мюнхен', country: 'DE' }, { name: 'Франкфурт', country: 'DE' },
  // Польша
  { name: 'Варшава', country: 'PL' }, { name: 'Гданьск', country: 'PL' },
  // ОАЭ, Иран
  { name: 'Дубай', country: 'AE' }, { name: 'Тегеран', country: 'IR' },
];

// Пользовательские города (синхронизируются в localStorage + в памяти)
import { storage } from './storage';
const CUSTOM_KEY = 'ur_custom_cities';
let _customCities = [];
const _listeners = new Set();

// Автоматическая загрузка при импорте (ленивая)
let _loaded = false;
export const loadCustomCities = async () => {
  try {
    const raw = await storage.get(CUSTOM_KEY);
    if (raw) _customCities = JSON.parse(raw);
  } catch {}
  _loaded = true;
  _listeners.forEach(cb => cb());
  return _customCities;
};
// Автозагрузка сразу
loadCustomCities();

// Подписка на изменения (для перерисовки компонентов)
export const subscribeToCities = (cb) => {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
};

export const addCustomCity = async (name, country = 'XX') => {
  const clean = name.trim();
  if (!clean) return;
  // Не дублируем
  const lower = clean.toLowerCase();
  if (BASE_CITIES.find(c => c.name.toLowerCase() === lower)) return;
  if (_customCities.find(c => c.name.toLowerCase() === lower)) return;
  _customCities.push({ name: clean, country, custom: true });
  try { await storage.set(CUSTOM_KEY, JSON.stringify(_customCities)); } catch {}
  _listeners.forEach(cb => cb());
};

export const getCustomCities = () => _customCities;

// Главный экспорт CITIES — база + кастомные
export const CITIES = new Proxy([], {
  get(_, prop) {
    const arr = [..._customCities, ...BASE_CITIES];
    if (prop === 'length') return arr.length;
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return arr[+prop];
    return arr[prop];
  },
});

// Поиск с приоритетом точного совпадения + опция "Другой"
export const searchCities = (query) => {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  const all = [..._customCities, ...BASE_CITIES];
  const matches = all.filter(c => c.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(q);
    const bStarts = b.name.toLowerCase().startsWith(q);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.name.localeCompare(b.name);
  });
  const result = matches.slice(0, 7);
  // Если точного совпадения нет — предлагаем «Другой»
  const hasExact = matches.some(c => c.name.toLowerCase() === q);
  if (!hasExact && q.length >= 2) {
    result.push({ name: query.trim(), country: 'XX', isCustom: true });
  }
  return result;
};

export const formatCity = (cityObj) => `${cityObj.name}, ${COUNTRIES[cityObj.country]?.flag || ''}`;
