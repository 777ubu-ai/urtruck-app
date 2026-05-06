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
    // Stage 28: гостевая сессия (без token) не должна стучаться в
    // защищённый endpoint — backend вернёт 403, фронт получит spam
    // в browser console и `Failed to load resource` в production.
    // Раньше владелец видел эти сообщения и думал что приложение
    // упало. Теперь возвращаем безопасный default локально.
    const h = await headers();
    if (!h.Authorization) return { unread: 0 };
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
