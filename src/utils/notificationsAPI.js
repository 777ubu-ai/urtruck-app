// API client для уведомлений
// #294: migrated to authedFetch for consistent 401 handling + request timeout.
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';

const BASE = `${API_BASE}/notifications`;

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export const notificationsAPI = {
  async list(limit = 50) {
    const r = await authedFetch(`${BASE}?limit=${limit}`, { headers: await headers() });
    if (!r.ok) return { notifications: [] };
    return r.json();
  },

  async unread() {
    // Stage 28/29: тот же short-circuit что в chatAPI.unread —
    // не вызываем endpoint если у пользователя нет phone-level
    // верификации (guest token недостаточно).
    const h = await headers();
    if (!h.Authorization) return { unread: 0 };
    const lvl = parseInt((await storage.get('ur_verification_level')) || '0', 10);
    if (!lvl || lvl < 1) return { unread: 0 };
    const r = await authedFetch(`${BASE}/unread`, { headers: h });
    if (!r.ok) return { unread: 0 };
    return r.json();
  },

  async readAll() {
    const r = await authedFetch(`${BASE}/read-all`, { method: 'POST', headers: await headers() });
    if (!r.ok) return {};
    return r.json();
  },

  async read(id) {
    const r = await authedFetch(`${BASE}/read/${id}`, { method: 'POST', headers: await headers() });
    if (!r.ok) return {};
    return r.json();
  },
};
