import { API_BASE } from '../config/env';
import { storage } from './storage';
import { authedFetch } from './authEvents';

const TOKEN_KEY = 'ur_reg_token';
const MARKET_BASE = `${API_BASE}/market`;

async function authHeaders() {
  const token = await storage.get(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function findDealInDashboard(dashboard, dealId) {
  if (!dealId) return null;
  const deals = Array.isArray(dashboard?.my_deals) ? dashboard.my_deals : [];
  return deals.find((item) => String(item?.id || '') === String(dealId)) || null;
}

// Security gate for deeplink/push/navigation deal entry.
// `/market/my` is already scoped by the authenticated backend user and is the
// same source that powers Deals. A navigation-supplied dealId is allowed only
// when that exact id is present in current user's `my_deals`.
//
// Return shape deliberately distinguishes a genuine DENIED membership from a
// transient network/server failure so the UI can fail closed without locking a
// legitimate participant out permanently.
export async function verifyDealMembership(dealId) {
  if (!dealId) return { ok: true, allowed: false, status: 400, deal: null };

  try {
    const response = await authedFetch(`${MARKET_BASE}/my`, {
      headers: await authHeaders(),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        allowed: false,
        status: response.status,
        deal: null,
      };
    }

    const deal = findDealInDashboard(data, dealId);

    return {
      ok: true,
      allowed: Boolean(deal),
      status: response.status,
      deal,
    };
  } catch {
    return { ok: false, allowed: false, status: 0, deal: null };
  }
}
