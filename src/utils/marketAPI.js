// Marketplace API — грузы, рейсы, ставки через сервер
import { Platform } from 'react-native';
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';  // QA-аудит P1-6: 401 → auth:expired

const BASE = `${API_BASE}/market`;

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

// PR-C2 critical fix (React error #31 / "Objects are not valid as a React
// child"): backend кидает HTTPException(403) с detail в форме ОБЪЕКТА
// для verification_required:
//   { error, current_level, required_level, required_name, hint }
// (см. backend/api/verification_gate.py). FastAPI сериализует это как
// JSON {detail: {...}}. Старый код возвращал `detail: d.detail` как
// есть → консьюмер делал `toast(r.detail || '...')` → Toast пытался
// отрендерить object в <Text> → краш всего приложения с белым экраном.
// Этот хелпер всегда возвращает string — для object с `hint` или
// `error` поле, для других — JSON.stringify fallback.
function normalizeDetail(d, status) {
  if (d == null) return `Ошибка ${status}`;
  if (typeof d === 'string') return d;
  if (typeof d === 'object') {
    if (d.hint && typeof d.hint === 'string' && d.hint.length) return d.hint;
    if (d.message && typeof d.message === 'string' && d.message.length) return d.message;
    if (d.error && typeof d.error === 'string' && d.error.length) return d.error;
    try { return JSON.stringify(d); } catch { return `Ошибка ${status}`; }
  }
  return String(d);
}

export const marketAPI = {
  // ─── Сохранённые маршруты (подписка «грузы по моему маршруту») ───
  // Эндпоинт вне /market: /api/v1/searches.
  async saveRoute({ from_city, to_city, truck_type = null }) {
    try {
      const r = await authedFetch(`${API_BASE}/searches`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ from_city, to_city, truck_type, notify: true }),
      });
      const data = await r.json().catch(() => ({}));
      return { ok: r.ok, ...data };
    } catch (e) {
      return { ok: false, detail: e?.message || 'network_error' };
    }
  },
  async listSavedRoutes() {
    try {
      const r = await authedFetch(`${API_BASE}/searches`, { headers: await headers() });
      if (!r.ok) return { searches: [] };
      return await r.json();
    } catch { return { searches: [] }; }
  },
  async deleteSavedRoute(id) {
    try {
      const r = await authedFetch(`${API_BASE}/searches/${id}`, { method: 'DELETE', headers: await headers() });
      return { ok: r.ok };
    } catch { return { ok: false }; }
  },

  // ─── Избранное (сохранённые водители/грузы) ── эндпоинт /api/v1/favorites
  async favCheck(item_type, item_id) {
    try {
      const r = await authedFetch(`${API_BASE}/favorites/check?item_type=${encodeURIComponent(item_type)}&item_id=${encodeURIComponent(item_id)}`, { headers: await headers() });
      if (!r.ok) return false;
      const d = await r.json();
      return !!d.is_favorite;
    } catch { return false; }
  },
  async favAdd(item_type, item_id, item_data = {}) {
    try {
      const r = await authedFetch(`${API_BASE}/favorites`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ item_type, item_id, item_data }),
      });
      return { ok: r.ok };
    } catch { return { ok: false }; }
  },
  async favRemove(item_type, item_id) {
    try {
      const r = await authedFetch(`${API_BASE}/favorites?item_type=${encodeURIComponent(item_type)}&item_id=${encodeURIComponent(item_id)}`, { method: 'DELETE', headers: await headers() });
      return { ok: r.ok };
    } catch { return { ok: false }; }
  },
  async favList(item_type = '') {
    try {
      const q = item_type ? `?item_type=${encodeURIComponent(item_type)}` : '';
      const r = await authedFetch(`${API_BASE}/favorites${q}`, { headers: await headers() });
      if (!r.ok) return { favorites: [] };
      return await r.json();
    } catch { return { favorites: [] }; }
  },

  // ─── Cargos ───
  async createCargo(data) {
    const r = await authedFetch(`${BASE}/cargos`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // Загрузка одного фото груза → storage-ключ (мультипарт, как в чате).
  // Ключ кладётся в cargos.photos; сервер подпишет его на выдаче.
  async uploadCargoPhoto(uri) {
    const token = await storage.get('ur_reg_token');
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((x) => x.blob());
      form.append('file', blob, 'cargo.jpg');
    } else {
      form.append('file', { uri, name: 'cargo.jpg', type: 'image/jpeg' });
    }
    const r = await authedFetch(`${BASE}/cargos/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!r.ok) throw new Error(`cargo photo upload failed ${r.status}`);
    return r.json();
  },

  async listCargos({ status = 'active', fromCity = '', toCity = '', cargoType = '', limit = 50, offset = 0 } = {}) {
    // Never inject demo data on failure — empty list + serverError flag so
    // FeedScreen renders the proper empty state instead of stale fallback.
    try {
      const params = new URLSearchParams({ status, from_city: fromCity, to_city: toCity, cargo_type: cargoType, limit, offset });
      const r = await authedFetch(`${BASE}/cargos?${params}`);
      if (!r.ok) return { cargos: [], total: 0, serverError: true, status: r.status };
      return r.json();
    } catch (e) {
      return { cargos: [], total: 0, serverError: true };
    }
  },

  async getCargo(id) {
    const r = await authedFetch(`${BASE}/cargos/${id}`);
    return r.json();
  },

  async deleteCargo(id) {
    const r = await authedFetch(`${BASE}/cargos/${id}`, { method: 'DELETE', headers: await headers() });
    return r.json();
  },

  // Задача B: гео-позиция машины по сделке.
  async sendDealLocation(dealId, coords) {
    try {
      const r = await authedFetch(`${BASE}/deals/${dealId}/location`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify(coords),
      });
      return r.ok ? r.json() : { ok: false, status: r.status };
    } catch { return { ok: false }; }
  },
  async getDealLocation(dealId) {
    try {
      const r = await authedFetch(`${BASE}/deals/${dealId}/location`, { headers: await headers() });
      if (!r.ok) return { ok: false, has_location: false, status: r.status };
      return r.json();
    } catch { return { ok: false, has_location: false }; }
  },

  // Задача A: правка своего активного груза (цена/описание/вес/объём).
  async updateCargo(id, payload) {
    const r = await authedFetch(`${BASE}/cargos/${id}`, {
      method: 'PATCH', headers: await headers(),
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // Накладная (CMR): подписанная ссылка для открытия в браузере/печати.
  async waybillLink(dealId) {
    const r = await authedFetch(`${BASE}/deals/${dealId}/waybill-link`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status) };
    return { ok: true, url: `${BASE}/deals/${dealId}/waybill?exp=${d.exp}&sig=${d.sig}` };
  },

  // Продлить груз одним тапом («Ещё актуально» — Модель А): дата = сегодня.
  async extendCargo(id) {
    const r = await authedFetch(`${BASE}/cargos/${id}/extend`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // ─── Trips ───
  async createTrip(data) {
    const r = await authedFetch(`${BASE}/trips`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async listTrips({ status = 'active', fromCity = '', toCity = '', truckType = '', limit = 50 } = {}) {
    try {
      const params = new URLSearchParams({ status, from_city: fromCity, to_city: toCity, truck_type: truckType, limit });
      const r = await authedFetch(`${BASE}/trips?${params}`);
      if (!r.ok) return { trips: [], total: 0, serverError: true, status: r.status };
      return r.json();
    } catch (e) {
      return { trips: [], total: 0, serverError: true };
    }
  },

  async getTrip(id) {
    const r = await authedFetch(`${BASE}/trips/${id}`);
    return r.json();
  },

  async updateTrip(id, payload) {
    const r = await authedFetch(`${BASE}/trips/${id}`, {
      method: 'PATCH', headers: await headers(),
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // Продлить рейс одним тапом («Ещё актуально» — Модель А): дата = сегодня.
  async extendTrip(id) {
    const r = await authedFetch(`${BASE}/trips/${id}/extend`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // ─── Bids ───
  async createBid(data) {
    const r = await authedFetch(`${BASE}/bids`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    const d = await r.json();
    if (!r.ok) {
      // Особый случай: у автора уже есть активная ставка. Бэк возвращает
      // объект с existing_bid_id/existing_amount/existing_message — прокидываем
      // как detailObj, чтобы модалка сама переключилась в режим edit.
      const raw = d && d.detail;
      if (r.status === 409 && raw && typeof raw === 'object' && raw.error === 'duplicate_bid') {
        return { ok: false, status: 409, detail: raw.message, detailObj: raw };
      }
      return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    }
    return d;
  },

  async listBids({ cargoId, tripId } = {}) {
    const params = new URLSearchParams();
    if (cargoId) params.set('cargo_id', cargoId);
    if (tripId) params.set('trip_id', tripId);
    const r = await authedFetch(`${BASE}/bids?${params}`, { headers: await headers() });
    return r.json();
  },

  async acceptBid(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/accept`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async updateBid(bidId, payload) {
    const r = await authedFetch(`${BASE}/bids/${bidId}`, {
      method: 'PATCH', headers: await headers(),
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async cancelBid(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/cancel`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async rejectBid(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/reject`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async counterBid(bidId, payload) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/counter`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // Часть 3: история цены по ставке (движение $6000→$5500→$5200 в пузыре/шапке).
  async bidEvents(bidId) {
    try {
      const r = await authedFetch(`${BASE}/bids/${bidId}/events`, { headers: await headers() });
      if (!r.ok) return { events: [] };
      return await r.json();
    } catch { return { events: [] }; }
  },

  async acceptCounterBid(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/counter/accept`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async declineCounterBid(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/counter/decline`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async openBidChat(bidId) {
    const r = await authedFetch(`${BASE}/bids/${bidId}/chat`, {
      method: 'POST', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  // ─── My Dashboard ───
  async myDashboard() {
    const empty = { my_trips: [], my_cargos: [], my_bids: [], incoming_bids: [], my_deals: [] };
    try {
      // Skip /market/my if no token (guest) — avoids 401/500
      const h = await headers();
      if (!h.Authorization) {
        return { ...empty, authRequired: true, skipped: true };
      }
      const r = await authedFetch(`${BASE}/my`, { headers: h });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) {
        return { ...empty, authRequired: true };
      }
      if (!r.ok) {
        console.warn('[myDashboard] server error:', r.status);
        return { ...empty, serverError: true };
      }
      return { ...empty, ...d };
    } catch (e) {
      console.warn('[myDashboard] fetch error:', e.message);
      return { ...empty, serverError: true };
    }
  },

  // ─── Drivers (approved, для клиентов) ───
  async listDrivers({ truckType = '' } = {}) {
    try {
      const params = new URLSearchParams({ truck_type: truckType });
      const r = await authedFetch(`${BASE}/drivers?${params}`);
      if (!r.ok) return { drivers: [], total: 0, serverError: true, status: r.status };
      return r.json();
    } catch (e) {
      return { drivers: [], total: 0, serverError: true };
    }
  },

  // ─── Deals ───
  async getDeal(dealId) {
    const r = await authedFetch(`${BASE}/deals/${dealId}`, { headers: await headers() });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },

  async updateDealStatus(dealId, newStatus) {
    const r = await authedFetch(`${BASE}/deals/${dealId}/status?new_status=${newStatus}`, {
      method: 'PATCH', headers: await headers(),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, detail: normalizeDetail(d.detail, r.status), status: r.status };
    return d;
  },
};
