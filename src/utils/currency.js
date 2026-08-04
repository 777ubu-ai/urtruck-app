// Мультивалюта: KZT / USD / CNY / UZS / RUB / KGS
// Курсы от НБ РК (hardcoded default + auto-update раз в день)
import { storage } from './storage';

const RATES_KEY = 'ur_currency_rates';
const RATES_TS_KEY = 'ur_currency_ts';

// Default rates (примерные на апрель 2026)
let rates = {
  USD: 1,
  KZT: 470,
  RUB: 92,
  CNY: 7.2,
  UZS: 12700,
  KGS: 89,
};

let loaded = false;

// Загрузка сохранённых
(async () => {
  try {
    const saved = await storage.get(RATES_KEY);
    if (saved) rates = JSON.parse(saved);
    loaded = true;
  } catch {}
})();

export async function fetchRates() {
  // Проверяем не обновляли ли уже сегодня
  const ts = await storage.get(RATES_TS_KEY);
  const now = new Date().toISOString().slice(0, 10);
  if (ts === now) return rates;

  try {
    // НБ РК API (публичный)
    const r = await fetch('https://nationalbank.kz/rss/rates_all.xml');
    if (r.ok) {
      const text = await r.text();
      // Парсим XML курсов
      const extract = (code) => {
        const m = text.match(new RegExp(`<title>${code}[^<]*</title>[\\s\\S]*?<description>([\\d.]+)</description>`));
        return m ? parseFloat(m[1]) : null;
      };
      const usd = extract('USD');
      const rub = extract('RUB');
      const cny = extract('CNY');
      if (usd) {
        rates.KZT = Math.round(usd);
        rates.RUB = rub ? Math.round(usd / rub * 100) / 100 : rates.RUB;
        rates.CNY = cny ? Math.round(usd / cny * 100) / 100 : rates.CNY;
      }
    }
  } catch {}

  try {
    // Fallback: exchangerate-api (free)
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    if (r.ok) {
      const data = await r.json();
      if (data.rates) {
        rates.KZT = data.rates.KZT || rates.KZT;
        rates.RUB = data.rates.RUB || rates.RUB;
        rates.CNY = data.rates.CNY || rates.CNY;
        rates.UZS = data.rates.UZS || rates.UZS;
        rates.KGS = data.rates.KGS || rates.KGS;
      }
    }
  } catch {}

  await storage.set(RATES_KEY, JSON.stringify(rates));
  await storage.set(RATES_TS_KEY, now);
  return rates;
}

/**
 * Конвертация из одной валюты в другую.
 * @param amount {number}
 * @param from {string} — 'USD' | 'KZT' | 'RUB' | 'CNY' | 'UZS' | 'KGS'
 * @param to {string}
 * @returns {number}
 */
export function convert(amount, from = 'USD', to = 'KZT') {
  if (from === to) return amount;
  // Через USD как базу
  const inUsd = from === 'USD' ? amount : amount / (rates[from] || 1);
  return Math.round(inUsd * (rates[to] || 1));
}

/**
 * Форматирование суммы с символом валюты.
 * USD/CNY → символ перед ($1,200), KZT/UZS/RUB/KGS → символ после (39 001 ₸)
 */
const CURRENCY_CONFIG = {
  USD: { symbol: '$', position: 'before', separator: ',' },
  CNY: { symbol: '¥', position: 'before', separator: ',' },
  EUR: { symbol: '€', position: 'before', separator: ',' },
  KZT: { symbol: '₸', position: 'after', separator: ' ' },
  UZS: { symbol: 'сум', position: 'after', separator: ' ' },
  RUB: { symbol: '₽', position: 'after', separator: ' ' },
  KGS: { symbol: 'сом', position: 'after', separator: ' ' },
};

export function formatMoney(amount, currency = 'USD') {
  const cfg = CURRENCY_CONFIG[currency];
  const abs = Math.abs(Math.round(amount));
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : '';
  // Неизвестная/legacy валюта (UZS/KGS и т.п.) — показываем сумму + ISO-код
  // (напр. «987654321 UZS»), а не подставляем чужой символ $. Конвертации нет.
  if (!cfg) {
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${sign}${formatted} ${currency}`;
  }
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, cfg.separator);
  return cfg.position === 'before'
    ? `${sign}${cfg.symbol}${formatted}`
    : `${sign}${formatted} ${cfg.symbol}`;
}

export function getRates() { return { ...rates }; }

// Пилотный набор для НОВЫХ операций (выбор валюты). EUR добавлен без курса —
// только символ/формат-конфиг, никакой конвертации (rates не трогаем).
export const CURRENCIES = ['USD', 'CNY', 'RUB', 'EUR'];
