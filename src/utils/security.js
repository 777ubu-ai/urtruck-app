// Клиент для UrTruck Security API
import { API_BASE } from '../config/env';

const SECURITY_API = API_BASE;

export const securityAPI = {
  async quickCheck({ phone, plate, name }) {
    try {
      const r = await fetch(`${SECURITY_API}/check/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, plate, name }),
      });
      return await r.json();
    } catch { return { in_blacklist: false, recommendation: 'UNKNOWN', offline: true }; }
  },

  async getScore(userId) {
    try {
      const r = await fetch(`${SECURITY_API}/score/${userId}`);
      return await r.json();
    } catch { return null; }
  },

  async fullCheck(data) {
    try {
      const r = await fetch(`${SECURITY_API}/check/full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return await r.json();
    } catch { return null; }
  },

  async getStats() {
    try {
      const r = await fetch(`${SECURITY_API}/stats`);
      return await r.json();
    } catch { return null; }
  },

  // OCR техпаспорта — загружаем файл → распознаём
  async ocrPassport(userId, uri) {
    try {
      const blob = await fetch(uri).then(r => r.blob());
      const form = new FormData();
      form.append('file', blob, 'passport.jpg');
      const r = await fetch(`${SECURITY_API}/ocr/passport?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST', body: form,
      });
      return await r.json();
    } catch (e) { return { success: false, error: e.message }; }
  },

  // Face Match — сверка селфи с документом
  async faceMatch(userId, selfieUri, docUri) {
    try {
      const selfieBlob = await fetch(selfieUri).then(r => r.blob());
      const docBlob = await fetch(docUri).then(r => r.blob());
      const form = new FormData();
      form.append('selfie', selfieBlob, 'selfie.jpg');
      form.append('document', docBlob, 'doc.jpg');
      const r = await fetch(`${SECURITY_API}/biometric/face_match?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST', body: form,
      });
      return await r.json();
    } catch (e) { return { match: false, error: e.message }; }
  },

  // Liveness check
  async livenessCheck(userId, selfieUri) {
    try {
      const blob = await fetch(selfieUri).then(r => r.blob());
      const form = new FormData();
      form.append('file', blob, 'selfie.jpg');
      const r = await fetch(`${SECURITY_API}/biometric/liveness?user_id=${encodeURIComponent(userId)}`, {
        method: 'POST', body: form,
      });
      return await r.json();
    } catch (e) { return { liveness_passed: false, error: e.message }; }
  },
};

// Лестница статусов водителя по РЕАЛЬНЫМ вехам (решение владельца):
//   🟡 Новичок     — зарегистрировался, документы ещё не подтверждены
//   🔵 Проверенный — документы подтверждены модератором (главный знак доверия)
//   🟢 Профи       — 10+ выполненных рейсов (+ рейтинг ≥ 4.7, если известен)
// Балл (security_score) — это «очки/прогресс» внутри уровня, а не сам уровень.
// ctx: { confirmed: bool, trips: number, rating: number|null }
// pct — «шкала доверия», привязана к уровню (не путает: 50/80/100), а не
// абстрактный балл. Новичок 50 · Проверенный 80 · Профи 100.
export function driverTier(ctx = {}) {
  const { confirmed = false, trips = 0, rating = null } = ctx;
  if (confirmed && trips >= 10 && (rating == null || rating >= 4.7)) {
    return { key: 'tier_pro',      color: '#168759', emoji: '🟢', pct: 100 };
  }
  if (confirmed) {
    return { key: 'tier_verified', color: '#2563EB', emoji: '🔵', pct: 80 };
  }
  return { key: 'tier_newbie',     color: '#D97706', emoji: '🟡', pct: 50 };
}

// Число выполненных рейсов из списка сделок (my_deals) дашборда.
export function countCompletedTrips(deals) {
  if (!Array.isArray(deals)) return 0;
  return deals.filter((d) => d && (d.status === 'delivered' || d.status === 'completed')).length;
}

// Признак «верификация пройдена» → уровень «Проверенный». В бете живого
// модератора нет (авто-одобрение), поэтому засчитываем сразу после успешного
// завершения верификации: status=approved или verification_level ≥ 3.
export function isDocsConfirmed(st) {
  if (!st) return false;
  if (st.status === 'rejected') return false;
  return st.status === 'approved' || Number(st.verification_level) >= 3;
}

// 2026-08-20 (App Store release audit, P1 locale leak): `label` used to hold a
// hardcoded Russian string ('🟢 Надёжный', …) that SecurityBadge rendered
// verbatim, so a ZH/EN/KK user saw Russian on driver profiles. Colors now carry
// an emoji + an i18n key; the consumer composes the localized label.
export const COLOR_UI = {
  green: { bg: '#16875920', border: '#168759', text: '#168759', emoji: '🟢', labelKey: 'badge_reliable' },
  yellow: { bg: '#FF840020', border: '#FF8400', text: '#FF8400', emoji: '🟡', labelKey: 'tier_newbie' },
  red: { bg: '#EF444420', border: '#EF4444', text: '#EF4444', emoji: '🔴', labelKey: 'security_badge_problems' },
  black: { bg: '#DC262640', border: '#DC2626', text: '#FCA5A5', emoji: '⛔', labelKey: 'blacklist' },
};
