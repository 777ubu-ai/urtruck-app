// Курсы валют с кэшем на 1 час
import { storage } from './storage';

const CACHE_KEY = 'ur_fx_rates';
const CACHE_TTL = 60 * 60 * 1000; // 1 час

// Бесплатный API без ключа (exchangerate.host / open.er-api.com)
const API = 'https://open.er-api.com/v6/latest/USD';

// Fallback — если API недоступен (примерные курсы на 13.04.2026)
const FALLBACK = {
  KZT: 470, CNY: 7.25, UZS: 12500, RUB: 92,
  EUR: 0.92, KGS: 87, AED: 3.67,
};

export async function fetchRates() {
  // Проверяем кэш
  const raw = await storage.get(CACHE_KEY);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      if (cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL) {
        return cached;
      }
    } catch {}
  }

  // Загружаем свежие
  try {
    const resp = await fetch(API);
    const data = await resp.json();
    if (data.result === 'success' && data.rates) {
      const result = {
        fetchedAt: Date.now(),
        rates: {
          KZT: data.rates.KZT || FALLBACK.KZT,
          CNY: data.rates.CNY || FALLBACK.CNY,
          UZS: data.rates.UZS || FALLBACK.UZS,
          RUB: data.rates.RUB || FALLBACK.RUB,
          EUR: data.rates.EUR || FALLBACK.EUR,
          KGS: data.rates.KGS || FALLBACK.KGS,
          AED: data.rates.AED || FALLBACK.AED,
        },
        source: 'open.er-api.com',
      };
      await storage.set(CACHE_KEY, JSON.stringify(result));
      return result;
    }
  } catch (e) {
    // Fallback на случай офлайна
  }
  return { fetchedAt: Date.now(), rates: FALLBACK, source: 'fallback' };
}
