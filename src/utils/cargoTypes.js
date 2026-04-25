// Типовые категории грузов + автосохранение кастомных
import { storage } from './storage';

export const BASE_CARGO_TYPES = [
  { name: 'Одежда и текстиль', icon: '👕', category: 'textile' },
  { name: 'Обувь', icon: '👟', category: 'textile' },
  { name: 'Электроника', icon: '📱', category: 'electronics' },
  { name: 'Бытовая техника', icon: '📺', category: 'electronics' },
  { name: 'Компьютеры и офисная техника', icon: '💻', category: 'electronics' },
  { name: 'Электросамокаты', icon: '🛴', category: 'electronics' },
  { name: 'LED-панели', icon: '💡', category: 'electronics' },
  { name: 'Автозапчасти', icon: '🔧', category: 'auto' },
  { name: 'Шины и диски', icon: '⚙️', category: 'auto' },
  { name: 'Автомобили', icon: '🚗', category: 'auto' },
  { name: 'Стройматериалы', icon: '🧱', category: 'construction' },
  { name: 'Металл и арматура', icon: '🔩', category: 'construction' },
  { name: 'Трубы', icon: '🧵', category: 'construction' },
  { name: 'Цемент', icon: '🪨', category: 'construction' },
  { name: 'Плитка керамическая', icon: '🧿', category: 'construction' },
  { name: 'Мебель', icon: '🛋️', category: 'furniture' },
  { name: 'Продукты питания', icon: '🍱', category: 'food' },
  { name: 'Мясо говяжье', icon: '🥩', category: 'food' },
  { name: 'Овощи и фрукты', icon: '🍎', category: 'food' },
  { name: 'Мёд', icon: '🍯', category: 'food' },
  { name: 'Зерно', icon: '🌾', category: 'food' },
  { name: 'Напитки', icon: '🥤', category: 'food' },
  { name: 'Медикаменты', icon: '💊', category: 'pharma' },
  { name: 'Косметика', icon: '💄', category: 'cosmetics' },
  { name: 'Игрушки', icon: '🧸', category: 'toys' },
  { name: 'Спорттовары', icon: '⚽', category: 'sports' },
  { name: 'Книги и канцелярия', icon: '📚', category: 'stationery' },
  { name: 'Бумажная продукция', icon: '📄', category: 'stationery' },
  { name: 'Химия (бытовая)', icon: '🧴', category: 'chemicals' },
  { name: 'Удобрения', icon: '🌱', category: 'chemicals' },
  { name: 'Сельхоз техника', icon: '🚜', category: 'machinery' },
  { name: 'Оборудование промышленное', icon: '⚒️', category: 'machinery' },
  { name: 'Товары для дома', icon: '🏠', category: 'home' },
  { name: 'Посуда', icon: '🍽️', category: 'home' },
  { name: 'Оптовые товары из Китая', icon: '📦', category: 'wholesale' },
  { name: 'Ткани рулонные', icon: '🧶', category: 'textile' },
  { name: 'Лом металла', icon: '⚙️', category: 'metal' },
  { name: 'Бумага для принтера', icon: '📃', category: 'stationery' },
  { name: 'Упаковка', icon: '📦', category: 'packaging' },
];

const CUSTOM_KEY = 'ur_custom_cargo_types';
let _custom = [];
const _listeners = new Set();

(async () => {
  try {
    const raw = await storage.get(CUSTOM_KEY);
    if (raw) _custom = JSON.parse(raw);
  } catch {}
  _listeners.forEach(cb => cb());
})();

export const subscribeToCargoTypes = (cb) => {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
};

export const addCustomCargoType = async (name) => {
  const clean = name.trim();
  if (!clean) return;
  const lower = clean.toLowerCase();
  if (BASE_CARGO_TYPES.find(c => c.name.toLowerCase() === lower)) return;
  if (_custom.find(c => c.name.toLowerCase() === lower)) return;
  _custom.push({ name: clean, icon: '📦', custom: true });
  try { await storage.set(CUSTOM_KEY, JSON.stringify(_custom)); } catch {}
  _listeners.forEach(cb => cb());
};

export const searchCargoTypes = (query) => {
  if (!query || query.length < 1) return BASE_CARGO_TYPES.slice(0, 8);
  const q = query.toLowerCase().trim();
  const all = [..._custom, ...BASE_CARGO_TYPES];
  const matches = all.filter(c => c.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aS = a.name.toLowerCase().startsWith(q);
    const bS = b.name.toLowerCase().startsWith(q);
    if (aS && !bS) return -1;
    if (!aS && bS) return 1;
    return 0;
  });
  const result = matches.slice(0, 7);
  if (!matches.some(c => c.name.toLowerCase() === q) && q.length >= 2) {
    result.push({ name: query.trim(), icon: '➕', isCustom: true });
  }
  return result;
};
