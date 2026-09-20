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

export const notificationsAPI = {
  async list(limit = 50) {
    const r = await fetch(`${BASE}?limit=${limit}`, { headers: await headers() });
    return r.json();
  },

  async unread() {
    // The server token/session is authoritative. A stale or missing local
    // verification-level cache must never hide durable notifications while
    // APNs/FCM still shows their badge on the app icon.
    const h = await headers();
    if (!h.Authorization) return { unread: 0 };
    const r = await fetch(`${BASE}/unread`, { headers: h });
    if (!r.ok) return { unread: 0 };
    return r.json();
  },

  async readAll() {
    const r = await fetch(`${BASE}/read-all`, { method: 'POST', headers: await headers() });
    return r.json();
  },

  async read(id) {
    const r = await fetch(`${BASE}/read/${id}`, { method: 'POST', headers: await headers() });
    return r.json();
  },
};
