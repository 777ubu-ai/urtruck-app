// API client для отзывов
// #294: migrated to authedFetch for consistent 401 handling + request timeout.
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';

const BASE = `${API_BASE}/reviews`;

const TOKEN_KEY = 'ur_reg_token';

export const reviewsAPI = {
  async create({ tripId, targetId, targetRole, rating, text, tags }) {
    const token = await storage.get(TOKEN_KEY);
    const r = await authedFetch(BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({
        trip_id: tripId,
        target_id: targetId,
        target_role: targetRole,
        rating,
        text,
        tags,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, detail: d.detail || r.statusText, status: r.status };
    }
    return r.json();
  },

  async forTarget(targetId) {
    const r = await authedFetch(`${BASE}/for/${targetId}`);
    if (!r.ok) return { reviews: [], summary: { average: 0, total: 0 } };
    return r.json();
  },

  async summary(targetId) {
    const r = await authedFetch(`${BASE}/summary/${targetId}`);
    if (!r.ok) return { average: 0, total: 0 };
    return r.json();
  },
};
