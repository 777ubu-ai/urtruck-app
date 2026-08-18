import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

const normalizePoint = (point) => {
  if (!Array.isArray(point) || point.length < 2) return null;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

export const routingAPI = {
  async roadRoute(points, vehicle = null) {
    const clean = (points || []).map(normalizePoint).filter(Boolean);
    if (clean.length < 2) return { ok: false, detail: 'not_enough_points' };
    try {
      const response = await authedFetch(`${API_BASE}/routing/road-route`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ points: clean, vehicle }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          detail: typeof data?.detail === 'string' ? data.detail : 'routing_failed',
        };
      }
      return data;
    } catch (error) {
      return { ok: false, detail: error?.message || 'network_error' };
    }
  },
};
