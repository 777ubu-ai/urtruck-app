import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';
const BASE = `${API_BASE}/driver/expenses`;
function query(params) {
  const entries = Object.entries(params || {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  return entries.length ? '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
}
export async function requestExpense(path = '', options = {}) {
  const token = await storage.get('ur_reg_token');
  if (!token) return { ok: false, status: 401 };
  try {
    const response = await authedFetch(BASE + path, { ...options, headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
    } });
    const data = await response.json().catch(() => ({}));
    if (await storage.get('ur_reg_token') !== token) return { ok: false, stale: true };
    return { ...data, ok: response.ok, status: response.status };
  } catch { return { ok: false, status: 0 }; }
}
export const expenseAPI = {
  options: (dealId) => requestExpense('/options' + query({ deal_id: dealId })),
  list: (params) => requestExpense(query(params)),
  save: (body, id) => requestExpense(id ? `/${encodeURIComponent(id)}` : '', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify(body),
  }),
  remove: (item) => requestExpense(`/${encodeURIComponent(item.id)}` + query({ version: item.version }), { method: 'DELETE' }),
};
