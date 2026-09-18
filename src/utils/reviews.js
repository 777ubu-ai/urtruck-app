// API client для отзывов
import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/reviews`;

const TOKEN_KEY = 'ur_reg_token';

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const error = new Error(body?.detail || `HTTP ${response.status}`);
      error.status = response.status;
      error.detail = body?.detail || null;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export const reviewsAPI = {
  async create({ tripId, targetId, targetRole, rating, text, tags }) {
    const token = await storage.get(TOKEN_KEY);
    return requestJson(BASE, {
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
  },

  async forTarget(targetId) {
    return requestJson(`${BASE}/for/${encodeURIComponent(targetId)}`);
  },

  async summary(targetId) {
    return requestJson(`${BASE}/summary/${encodeURIComponent(targetId)}`);
  },

  async eligibility(targetId, tripId) {
    const token = await storage.get(TOKEN_KEY);
    const query = tripId ? `?trip_id=${encodeURIComponent(tripId)}` : '';
    return requestJson(`${BASE}/eligibility/${encodeURIComponent(targetId)}${query}`, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '' },
    });
  },
};
