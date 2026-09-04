// Подписка на разблокировку контактов (Google Play Billing).
// Сервер — единственный источник правды о том, активна ли подписка и
// сколько контактов уже открыто в этом месяце; этот модуль только читает
// его состояние и передаёт результат покупки на верификацию.
import { API_BASE } from '../config/env';
import { storage } from './storage';
import { authedFetch } from './authEvents';

const BASE = `${API_BASE}/payments`;
const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export const subscriptionAPI = {
  // {monetization_enabled, active, plan, period_end, auto_renewing,
  //  contacts_used_this_period, contacts_limit, google_product_id}
  async status() {
    try {
      const r = await authedFetch(`${BASE}/subscription/status`, { headers: await headers() });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, ...data };
    } catch {
      return { ok: false };
    }
  },

  // Вызывается сразу после успешной покупки в react-native-iap — сервер сам
  // перепроверяет покупку у Google, клиентский "успех" доступ не даёт.
  async verifyGooglePurchase(productId, purchaseToken) {
    try {
      const r = await authedFetch(`${BASE}/google/verify`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ product_id: productId, purchase_token: purchaseToken }),
      });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, ...data };
    } catch {
      return { ok: false };
    }
  },
};
