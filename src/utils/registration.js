// Client for /api/v1/register/*
import { storage } from './storage';
import { compressImage } from './imageCompress';
import { getLanguage } from './i18n';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/register`;

const TOKEN_KEY = 'ur_reg_token';
const LEVEL_KEY = 'ur_verification_level';

// PR-C2: см. marketAPI.normalizeDetail — те же причины. Backend
// иногда возвращает detail как object (verification_required),
// фронт пытается отрендерить его как <Text> → React error #31.
function normalizeDetail(d, fallback) {
  if (d == null) return fallback;
  if (typeof d === 'string') return d;
  if (typeof d === 'object') {
    if (d.hint && typeof d.hint === 'string' && d.hint.length) return d.hint;
    if (d.error && typeof d.error === 'string' && d.error.length) return d.error;
    if (d.message && typeof d.message === 'string') return d.message;
    try { return JSON.stringify(d); } catch { return fallback; }
  }
  return String(d);
}

export const regAPI = {
  // ─── Lazy registration ───
  async ensureGuest() {
    // Если уже есть токен — вернуть его
    const existing = await storage.get(TOKEN_KEY);
    if (existing) return { token: existing };
    // Иначе создаём гостевую сессию
    const r = await fetch(`${BASE}/guest`, { method: 'POST' });
    const data = await r.json();
    if (data.token) {
      await storage.set(TOKEN_KEY, data.token);
      await storage.set(LEVEL_KEY, String(data.verification_level || 0));
    }
    return data;
  },

  async me() {
    const token = await this.getToken();
    if (!token) return null;
    const r = await fetch(`${BASE}/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (r.status === 401) {
      // Не удаляем token — возможно сеть/сервер временно недоступен.
      // Юзер сам выйдет через signOut если нужно.
      return null;
    }
    const data = await r.json();
    if (typeof data.verification_level === 'number') {
      await storage.set(LEVEL_KEY, String(data.verification_level));
    }
    return data;
  },

  async getLevel() {
    const v = await storage.get(LEVEL_KEY);
    return v ? parseInt(v, 10) : 0;
  },

  async sendCode(phone, channel = 'whatsapp', extra = {}) {
    // Stage 24: backend требует consent=true перед отправкой OTP.
    // Передаём явный consent (UI выставляет true только если
    // чекбокс отмечен) + опционально role для audit.
    //
    // Stage 39: backend rate-limit (429) надо отдавать UI как
    // {cooldown_sec, cooldown: true} чтобы PremiumRegister/Login
    // показал «Код уже отправлен — повторно через NN мин» и кнопку
    // «Ввести код», вместо сырого «Подожди 1513 сек».
    const r = await fetch(`${BASE}/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        channel,
        consent: extra.consent === true,
        role: extra.role || null,
      }),
    });
    let data = {};
    try { data = await r.json(); } catch {}
    if (r.status === 429) {
      // backend кладёт detail = "Слишком много запросов. Подожди NNN сек."
      // и Retry-After header. Извлекаем число секунд.
      const retryHeader = r.headers.get('Retry-After');
      let cooldown = retryHeader ? parseInt(retryHeader, 10) : 0;
      if (!cooldown) {
        const m = /(\d+)\s*сек/.exec(data.detail || '');
        if (m) cooldown = parseInt(m[1], 10);
      }
      return {
        sent: false,
        ok: false,
        cooldown: true,
        cooldown_sec: cooldown || 60,
        detail: normalizeDetail(data.detail, 'rate_limited'),
      };
    }
    return data;
  },

  async verifyCode(phone, code) {
    // Апгрейд гостевого токена в phone-верифицированный
    const guestToken = await storage.get(TOKEN_KEY);
    const r = await fetch(`${BASE}/whatsapp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, guest_token: guestToken }),
    });
    let data = {};
    try { data = await r.json(); } catch {}
    // Stage 40: 429 rate-limit verify тоже отдаём в structured form,
    // чтобы UI не показывал raw 'Подожди NNN сек'.
    if (r.status === 429) {
      const retryHeader = r.headers.get('Retry-After');
      let cooldown = retryHeader ? parseInt(retryHeader, 10) : 0;
      if (!cooldown) {
        const m = /(\d+)\s*сек/.exec(data.detail || '');
        if (m) cooldown = parseInt(m[1], 10);
      }
      return {
        token: null,
        cooldown: true,
        cooldown_sec: cooldown || 60,
        detail: normalizeDetail(data.detail, 'rate_limited'),
      };
    }
    if (data.token) {
      await storage.set(TOKEN_KEY, data.token);
      await storage.set(LEVEL_KEY, String(data.verification_level || 1));
    }
    return data;
  },

  async getToken() {
    return await storage.get(TOKEN_KEY);
  },

  async clearToken() {
    return await storage.remove(TOKEN_KEY);
  },

  // PR-C1: GET /api/v1/users/me — расширенный профиль (name + city + about
  // + vehicle). /register/me возвращает только full_name без city, поэтому
  // AuthContext.refreshLevel читает оба endpoint'a и объединяет данные.
  // Fail-tolerant: при 401/сети/таймауте возвращает null, чтобы провал
  // не ронял auth-flow.
  async profile() {
    const token = await this.getToken();
    if (!token) return null;
    try {
      const r = await fetch(`${API_BASE}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  },

  // Stage 50: PATCH /api/v1/users/me — сохраняем name/city из
  // PremiumProfileScreen в БД, чтобы ProfileScreen после регистрации
  // не показывал «Добавить имя».
  async updateProfile({ name, city, about } = {}) {
    const token = await this.getToken();
    if (!token) return { ok: false, detail: 'no_token' };
    const r = await fetch(`${API_BASE}/users/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...(name !== undefined ? { name } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(about !== undefined ? { about } : {}),
      }),
    });
    let data = {};
    try { data = await r.json(); } catch {}
    return { ok: r.ok, ...data };
  },

  async uploadSelfie(iin, fullName, uri, onProgress) {
    const token = await this.getToken();
    onProgress?.('compressing');
    const compressedUri = await compressImage(uri, { maxSide: 1200, quality: 0.72 });
    const blob = await fetch(compressedUri).then(r => r.blob());
    onProgress?.('uploading');
    const form = new FormData();
    form.append('file', blob, 'selfie.jpg');
    form.append('iin', iin);
    form.append('full_name', fullName);
    const r = await fetch(`${BASE}/selfie`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    return r.json();
  },

  async uploadLicense(uri, onProgress) {
    const token = await this.getToken();
    onProgress?.('compressing');
    const compressedUri = await compressImage(uri, { maxSide: 1400, quality: 0.75 });
    const blob = await fetch(compressedUri).then(r => r.blob());
    onProgress?.('uploading');
    const form = new FormData();
    form.append('file', blob, 'license.jpg');
    form.append('lang', getLanguage());
    const r = await fetch(`${BASE}/documents/license`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    return r.json();
  },

  async uploadPassport(uri, onProgress) {
    const token = await this.getToken();
    onProgress?.('compressing');
    const compressedUri = await compressImage(uri, { maxSide: 1400, quality: 0.75 });
    const blob = await fetch(compressedUri).then(r => r.blob());
    onProgress?.('uploading');
    const form = new FormData();
    form.append('file', blob, 'passport.jpg');
    form.append('lang', getLanguage());
    const r = await fetch(`${BASE}/documents/passport`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    return r.json();
  },

  async saveVehicle({ vehicleType, capacityKg, plate, brand, year, photoUri, onProgress }) {
    const token = await this.getToken();
    const form = new FormData();
    form.append('vehicle_type', vehicleType);
    form.append('capacity_kg', String(capacityKg));
    form.append('plate', plate || '');
    form.append('brand', brand || '');
    form.append('year', String(year || 0));
    if (photoUri) {
      onProgress?.('compressing');
      // Фото машины — без мелких деталей, 1200px хватит. quality 0.7 даёт ~200-400 KB
      const compressedUri = await compressImage(photoUri, { maxSide: 1200, quality: 0.7 });
      const blob = await fetch(compressedUri).then(r => r.blob());
      form.append('photo', blob, 'vehicle.jpg');
    }
    onProgress?.('uploading');
    const r = await fetch(`${BASE}/vehicle`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });
    return r.json();
  },

  async moderate() {
    const token = await this.getToken();
    const r = await fetch(`${BASE}/moderate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return r.json();
  },

  async status() {
    const token = await this.getToken();
    if (!token) return null;
    const r = await fetch(`${BASE}/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return r.json();
  },
};
