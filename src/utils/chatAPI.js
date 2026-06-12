import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';  // QA-аудит P1-6: 401 → auth:expired
import { getLanguage } from './i18n';        // QA-аудит P2-8: язык для авто-ответа поддержки

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
  async send({ toUserId, text, photoUrl, isVoice, voiceDuration, cargoId, tripId, clientMsgId }) {
    const r = await authedFetch(`${BASE}/send`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify({
        to_user_id: toUserId, text, photo_url: photoUrl,
        is_voice: isVoice || false, voice_duration: voiceDuration,
        cargo_id: cargoId, trip_id: tripId,
        client_msg_id: clientMsgId,  // QA-аудит P1-3: идемпотентность
        lang: getLanguage(),         // QA-аудит P2-8: локализация авто-ответа поддержки
      }),
    });
    if (!r.ok) throw new Error(`send failed ${r.status}`);  // outbox ловит и ретраит
    return r.json();
  },

  async rooms() {
    const r = await authedFetch(`${BASE}/rooms`, { headers: await headers() });
    return r.json();
  },

  async messages(roomId, limit = 100) {
    const r = await authedFetch(`${BASE}/messages/${roomId}?limit=${limit}`, { headers: await headers() });
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
    const r = await authedFetch(`${BASE}/unread`, { headers: h });
    if (!r.ok) return { unread: 0 };
    return r.json();
  },

  async translate(messageId, targetLang) {
    const r = await authedFetch(`${BASE}/translate`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify({ message_id: messageId, target_lang: targetLang }),
    });
    return r.json();
  },

  // --- Deal Room (PR #60 backend foundation) ---
  // Новые эндпоинты. Старые send/rooms/messages/unread/translate не трогаются.
  async conversations() {
    const r = await authedFetch(`${BASE}/conversations`, { headers: await headers() });
    return r.json();
  },

  async dealTimeline(dealId) {
    const r = await authedFetch(`${API_BASE}/deals/${dealId}/timeline`, { headers: await headers() });
    return r.json();
  },

  async supportEscalate({ conversationId = null, reason = null } = {}) {
    const r = await authedFetch(`${API_BASE}/support/escalate`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify({ conversation_id: conversationId, reason }),
    });
    return r.json();
  },

  // --- Smart actions (PR4) ---
  // Принять ставку. Использует существующий marketplace-эндпоинт
  // /market/bids/{bidId}/accept (он же пишет immutable deal.bid_accepted).
  async acceptBid(bidId) {
    const r = await authedFetch(`${API_BASE}/market/bids/${bidId}/accept`, {
      method: 'POST', headers: await headers(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.detail || `accept failed ${r.status}`);
    return data;
  },

  // --- Attachments (PR3 media foundation) ---
  async listAttachments(conversationId) {
    const r = await authedFetch(`${API_BASE}/chat/conversations/${conversationId}/attachments`, {
      headers: await headers(),
    });
    return r.json();
  },

  // Загрузка вложения. uri — локальный путь после сжатия (compressImage).
  // multipart/form-data: НЕ ставим Content-Type вручную (boundary задаёт fetch).
  async uploadAttachment(conversationId, { uri, kind = 'document', name = 'file.jpg', type = 'image/jpeg' } = {}) {
    const token = await storage.get(TOKEN_KEY);
    const blob = await authedFetch(uri).then((res) => res.blob());
    const form = new FormData();
    form.append('file', blob, name);
    form.append('kind', kind);
    const r = await authedFetch(`${API_BASE}/chat/conversations/${conversationId}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!r.ok) throw new Error(`upload failed ${r.status}`);
    return r.json();
  },
};
