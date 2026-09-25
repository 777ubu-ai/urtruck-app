import { storage } from './storage';
import { API_BASE } from '../config/env';
import { t as tGlobal } from './i18n';

const BASE = `${API_BASE}/driver/vehicles`;
const request = async (path = '', options = {}) => {
  const token = await storage.get('ur_reg_token');
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token || ''}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 401) {
      return { ok: false, authRequired: true, status: r.status, detail: tGlobal('session_expired') };
    }
    const structured = data?.detail && typeof data.detail === 'object' ? data.detail : null;
    return {
      ...data,
      ok: r.ok,
      status: r.status,
      error: structured?.error || data?.error,
      detail: structured?.message || data?.detail,
    };
  } catch {
    return { ok: false, status: 0, detail: tGlobal('network_error') };
  }
};
export const vehicleAPI = {
  list: () => request(),
  save: (vehicle, vehicleId) => request(
    vehicleId ? `?vehicle_id=${encodeURIComponent(vehicleId)}` : '',
    { method: 'PUT', body: JSON.stringify(vehicle) },
  ),
  remove: (vehicleId) => request(`/${encodeURIComponent(vehicleId)}`, { method: 'DELETE' }),
};
