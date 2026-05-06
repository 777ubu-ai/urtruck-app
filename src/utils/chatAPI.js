import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/chat`;

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export const chatAPI = {
  async send({ toUserId, text, photoUrl, isVoice, voiceDuration, cargoId, tripId }) {
    const r = await fetch(`${BASE}/send`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify({
        to_user_id: toUserId, text, photo_url: photoUrl,
        is_voice: isVoice || false, voice_duration: voiceDuration,
        cargo_id: cargoId, trip_id: tripId,
      }),
    });
    return r.json();
  },

  async rooms() {
    const r = await fetch(`${BASE}/rooms`, { headers: await headers() });
    return r.json();
  },

  async messages(roomId, limit = 100) {
    const r = await fetch(`${BASE}/messages/${roomId}?limit=${limit}`, { headers: await headers() });
    return r.json();
  },

  async unread() {
    // Stage 28/29: short-circuit ДО fetch'а для guest-сессий.
    // Раньше проверяли только наличие Authorization header'а, но
    // гость тоже имеет token (из ensureGuest()), просто без
    // verification_level. Теперь дополнительно проверяем
    // ur_verification_level в storage — если < 1 (гость), не
    // обращаемся к защищённому endpoint'у, чтобы browser console
    // не спамил `Failed to load resource: 403`.
    const h = await headers();
    if (!h.Authorization) return { unread: 0 };
    const lvl = parseInt((await storage.get('ur_verification_level')) || '0', 10);
    if (!lvl || lvl < 1) return { unread: 0 };
    const r = await fetch(`${BASE}/unread`, { headers: h });
    if (!r.ok) return { unread: 0 };
    return r.json();
  },

  async translate(messageId, targetLang) {
    const r = await fetch(`${BASE}/translate`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify({ message_id: messageId, target_lang: targetLang }),
    });
    return r.json();
  },
};
