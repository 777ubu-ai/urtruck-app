import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/notifications`;

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function request(path = '', options = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: await headers(),
    });
  } catch (error) {
    const failure = new Error('notifications_network_error');
    failure.code = 'network';
    failure.cause = error;
    throw failure;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error('notifications_server_error');
    failure.code = 'server';
    failure.status = response.status;
    failure.detail = data?.detail;
    throw failure;
  }
  return data;
}

export const notificationsAPI = {
  async list(limit = 50) {
    return request(`?limit=${encodeURIComponent(limit)}`);
  },

  async unread() {
    // Stage 28/29: тот же short-circuit что в chatAPI.unread —
    // не вызываем endpoint если у пользователя нет phone-level
    // верификации (guest token недостаточно).
    const h = await headers();
    if (!h.Authorization) return { unread: 0 };
    const lvl = parseInt((await storage.get('ur_verification_level')) || '0', 10);
    if (!lvl || lvl < 1) return { unread: 0 };
    const r = await fetch(`${BASE}/unread`, { headers: h });
    if (!r.ok) return { unread: 0 };
    return r.json();
  },

  async readAll() {
    return request('/read-all', { method: 'POST' });
  },

  async read(id) {
    return request(`/read/${encodeURIComponent(id)}`, { method: 'POST' });
  },
};
