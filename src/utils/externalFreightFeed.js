import { API_BASE } from '../config/env';
import { storage } from './storage';
import { authedFetch } from './authEvents';

export const EXTERNAL_FREIGHT_ENABLED = String(process.env.EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED || '').toLowerCase() === 'true';

function queryString(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return params.toString();
}

async function request(path, { signal, method = 'GET', body, isCurrent } = {}) {
  const token = await storage.get('ur_reg_token');
  if (isCurrent && !isCurrent()) return { ok: false, error: 'session_changed' };
  if (!token) return { ok: false, status: 401, error: 'auth_required' };
  try {
    const response = await authedFetch(`${API_BASE}/external-freight${path}`, {
      method,
      signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    return response.ok ? { ok: true, ...data } : { ok: false, status: response.status, error: data?.detail?.error || data?.detail || 'server_error' };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return { ok: false, error: 'network_error' };
  }
}

export const externalFreightAPI = {
  count(signal, isCurrent) {
    return request('/count', { signal, isCurrent });
  },
  list(filters = {}, signal) {
    const query = queryString(filters);
    return request(query ? `?${query}` : '', { signal });
  },
  bookmark(id, saved, signal, isCurrent) {
    return request(`/${encodeURIComponent(id)}/bookmark`, { method: saved ? 'PUT' : 'DELETE', signal, isCurrent });
  },
  event(name) {
    return request('/events', { method: 'POST', body: { name } }).catch(() => ({ ok: false }));
  },
};
