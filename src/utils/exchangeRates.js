// Курсы валют: только live API или ранее подтверждённый кэш.
import { storage } from './storage';

const CACHE_KEY = 'ur_fx_rates';
const CACHE_TTL = 60 * 60 * 1000;
const API = 'https://open.er-api.com/v6/latest/USD';

const validRates = (rates) => ['KZT', 'CNY', 'RUB'].every((code) => (
  Number.isFinite(Number(rates?.[code])) && Number(rates[code]) > 0
));

export async function fetchRates() {
  let cached = null;
  const raw = await storage.get(CACHE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.fetchedAt && validRates(parsed?.rates)) cached = parsed;
    } catch {}
  }
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return { ...cached, source: 'cache', stale: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(API, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.result !== 'success' || !validRates(data.rates)) {
      throw new Error('invalid_fx_payload');
    }
    const result = {
      fetchedAt: Date.now(),
      rates: {
        KZT: Number(data.rates.KZT),
        CNY: Number(data.rates.CNY),
        RUB: Number(data.rates.RUB),
      },
      source: 'open.er-api.com',
      stale: false,
    };
    await storage.set(CACHE_KEY, JSON.stringify(result));
    return result;
  } catch {
    if (cached) return { ...cached, source: 'cache', stale: true };
    return { fetchedAt: null, rates: null, source: 'unavailable', stale: false };
  } finally {
    clearTimeout(timeout);
  }
}
