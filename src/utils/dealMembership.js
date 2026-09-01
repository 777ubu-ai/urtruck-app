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
//
// P0 2026-09-01 (root cause, см. src/utils/dealLinkGuard.js): раньше этот
// probe ходил в тяжёлый GET /market/my (весь дашборд юзера) — на cold-start
// deeplink он не укладывался в 20-секундный authedFetch-таймаут и валил
// легитимного участника в abort. Оракул членства заменён на ЛЁГКИЙ
// участник-gated GET /market/deals/{deal_id}: сервер сам отвечает
// участнику 200, чужому 403, по несуществующей сделке 404 — точечный
// SELECT по PK вместо полной выборки дашборда.
//
// Return shape deliberately distinguishes a genuine DENIED membership from a
// transient network/server failure so the UI can fail closed without locking a
// legitimate participant out permanently:
//   ok:true,  allowed:true   → участник (200);
//   ok:true,  allowed:false  → доказанный отказ (401/403/404);
//   ok:false                 → транзиент (5xx/сеть/abort) — retryable.
export async function verifyDealMembership(dealId) {
  if (!dealId) return { ok: true, allowed: false, status: 400, deal: null };

  try {
    const response = await authedFetch(`${MARKET_BASE}/deals/${encodeURIComponent(dealId)}`, {
      headers: await authHeaders(),
    });
    const data = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      return { ok: true, allowed: false, status: response.status, deal: null };
    }

    if (!response.ok) {
      return { ok: false, allowed: false, status: response.status, deal: null };
    }

    // Регистро-независимо (RFC 4122): сервер отдаёт канонический id из БД.
    if (String(data?.id || '').toLowerCase() !== String(dealId).toLowerCase()) {
      // 200 с чужим телом — аномалия транспорта/прокси: fail closed, retryable.
      return { ok: false, allowed: false, status: response.status, deal: null };
    }

    return { ok: true, allowed: true, status: response.status, deal: data };
  } catch {
    return { ok: false, allowed: false, status: 0, deal: null };
  }
}
