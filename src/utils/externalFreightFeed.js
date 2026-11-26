import { API_BASE } from '../config/env';
import Constants from 'expo-constants';
import { storage } from './storage';
import { authedFetch } from './authEvents';

const configuredFeedFlag = Constants?.expoConfig?.extra?.urtruckExternalFreightFeedEnabled;
const envFeedFlag = process.env.EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED;
export const EXTERNAL_FREIGHT_ENABLED = [configuredFeedFlag, envFeedFlag]
  .some(value => String(value || '').toLowerCase() === 'true');

function cacheHash(value) {
  let result = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function externalFreightFeedCacheKey(owner, filters, savedOnly) {
  return `ur_external_feed_v1_${cacheHash(owner)}_${cacheHash(JSON.stringify([filters || {}, Boolean(savedOnly)]))}`;
}

export async function readExternalFreightFeedCache(key) {
  const raw = await storage.get(key);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw);
    if (!Array.isArray(cached?.items) || (cached.nextCursor != null && typeof cached.nextCursor !== 'string')) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function writeExternalFreightFeedCache(key, value) {
  if (!key || !Array.isArray(value?.items)) return;
  await storage.set(key, JSON.stringify(value));
}

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
    return request('/count?include_carriers=true', { signal, isCurrent });
  },
  list(filters = {}, signal) {
    const query = queryString({ ...filters, include_carriers: true });
    return request(query ? `?${query}` : '', { signal });
  },
  bookmark(id, saved, signal, isCurrent) {
    return request(`/${encodeURIComponent(id)}/bookmark`, { method: saved ? 'PUT' : 'DELETE', signal, isCurrent });
  },
  event(name) {
    return request('/events', { method: 'POST', body: { name } }).catch(() => ({ ok: false }));
  },
};
