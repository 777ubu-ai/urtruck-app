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

// Лестница статусов водителя (4 уровня роста) по баллам скоринга.
// Новый → Новичок → Опытный → Профи. Возвращает i18n-ключ + цвет + эмодзи.
// Чёрный список обрабатывается отдельно (color_code === 'black').
export function driverTier(score) {
  const s = Number(score) || 0;
  if (s >= 85) return { key: 'tier_pro',         color: '#22C55E', emoji: '🟢' };
  if (s >= 65) return { key: 'tier_experienced', color: '#2563EB', emoji: '🔵' };
  if (s >= 45) return { key: 'tier_newbie',      color: '#FF8400', emoji: '🟡' };
  return              { key: 'tier_new',          color: '#94A3B8', emoji: '🔓' };
}

export const COLOR_UI = {
  green: { bg: '#22C55E20', border: '#22C55E', text: '#22C55E', label: '🟢 Надёжный' },
  yellow: { bg: '#FF840020', border: '#FF8400', text: '#FF8400', label: '🟡 Новичок' },
  red: { bg: '#EF444420', border: '#EF4444', text: '#EF4444', label: '🔴 Проблемы' },
  black: { bg: '#DC262640', border: '#DC2626', text: '#FCA5A5', label: '⛔ В чёрном списке' },
};
