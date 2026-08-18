import { API_BASE } from '../config/env';
import { storage } from './storage';
import { authedFetch } from './authEvents';

const TOKEN_KEY = 'ur_reg_token';

export async function getDealCounterpartyProfile(userId) {
  if (!userId) return null;
  const token = await storage.get(TOKEN_KEY);
  const response = await authedFetch(`${API_BASE}/users/counterparty/${encodeURIComponent(userId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) return null;
  return response.json();
}

export function compactCounterpartyName(profile, fallback = '') {
  if (!profile) return fallback || '';
  const values = [profile.name, profile.company_name, profile.country]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].join(' · ') || fallback || '';
}
