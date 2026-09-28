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
  if (point[0] == null || point[1] == null || String(point[0]).trim() === '' || String(point[1]).trim() === '') return null;
  const lat = Number(point[0]);
  const lng = Number(point[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

export const routingAPI = {
  async roadRoute(points, vehicle = null, { signal, timeoutMs = 90_000 } = {}) {
    const clean = Array.isArray(points) ? points.map(normalizePoint) : [];
    if (clean.length < 2 || clean.some((point) => !point)) return { ok: false, detail: 'invalid_route_points' };
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await authedFetch(`${API_BASE}/routing/road-route`, {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ points: clean, vehicle }),
        signal: controller.signal,
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
      return { ok: false, detail: controller.signal.aborted ? 'routing_cancelled_or_timeout' : error?.message || 'network_error' };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  },
};
