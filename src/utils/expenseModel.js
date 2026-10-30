import { withAdditionalLanguages } from './additionalLocales.js';
export const EXPENSE_CATEGORIES = ['fuel', 'food', 'parking', 'daily', 'repair', 'other'];
export const EXPENSE_CURRENCIES = ['KZT', 'USD', 'RUB', 'CNY', 'EUR', 'KGS', 'UZS', 'BYN'];
export const localExpenseDate = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function parseExpenseAmount(input) {
  const text = String(input ?? '').replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return minor > 0 && minor <= 99999999999 ? `${Number(whole)}.${fraction.padEnd(2, '0')}` : null;
}
export function validExpenseDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text || '') || text < '2000-01-01' || text > '2100-12-31') return false;
  const date = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
export const newExpenseClientId = () => `expense_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function makeExpenseBody(form, clientId) {
  const amount = parseExpenseAmount(form.amount);
  if (!amount || !validExpenseDate(form.spent_on) || !EXPENSE_CATEGORIES.includes(form.category)
      || !EXPENSE_CURRENCIES.includes(form.currency) || String(form.description || '').length > 500) return null;
  return { client_id: clientId, amount, currency: form.currency, category: form.category,
    description: String(form.description || '').trim(), spent_on: form.spent_on,
    deal_id: form.deal_id || null, vehicle_id: form.vehicle_id || null,
    ...(form.version ? { version: form.version } : {}) };
}
export function formatExpenseMoney(amount, currency, lang = 'RU') {
  const locale = withAdditionalLanguages({ RU: 'ru-RU', EN: 'en-US', KK: 'kk-KZ', ZH: 'zh-CN' })[lang] || 'en-US';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(amount))} ${currency}`;
}
