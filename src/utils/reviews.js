// API client для отзывов
import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/reviews`;

const TOKEN_KEY = 'ur_reg_token';

export const reviewsAPI = {
  async create({ dealId, tripId, targetId, targetRole, rating, text, tags }) {
    const token = await storage.get(TOKEN_KEY);
    const r = await fetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        deal_id: dealId,
        trip_id: tripId,
        target_id: targetId,
        target_role: targetRole,
        rating,
        text,
        tags,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const raw = data?.detail;
      const detail = typeof raw === 'string' ? raw : (raw?.message || `HTTP ${r.status}`);
      return { ok: false, status: r.status, detail };
    }
    return data;
  },

  async forTarget(targetId) {
    const r = await fetch(`${BASE}/for/${targetId}`);
    return r.json();
  },

  async summary(targetId) {
    const r = await fetch(`${BASE}/summary/${targetId}`);
    return r.json();
  },
};
