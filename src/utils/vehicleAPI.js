import { storage } from './storage';
import { API_BASE } from '../config/env';
import { t as tGlobal } from './i18n';

const BASE = `${API_BASE}/driver/vehicles`;
const request = async (path = '', options = {}) => {
  const token = await storage.get('ur_reg_token');
  try {
    const r = await fetch(`${BASE}${path}`, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' } });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, ...data };
  } catch (error) {
    // §15 i18n P2 fix: same pattern as registration.js/marketAPI.js — never
    // leak the raw (English, untranslated) runtime error message to a
    // user-facing `detail` field.
    return { ok: false, detail: tGlobal('network_error') };
  }
};
export const vehicleAPI = {
  list: () => request(),
  save: (vehicle, vehicleId) => request(vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : '', { method: 'PUT', body: JSON.stringify(vehicle) }),
};
