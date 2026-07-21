import { Platform } from 'react-native';
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
  async send({ roomId, toUserId, text, photoUrl, isVoice, voiceDuration, cargoId, tripId, clientMsgId }) {
    // C3 (device-баг «ложное нет сети»): различаем СЕТЕВОЙ сбой (fetch
    // reject/таймаут — запрос не дошёл) и HTTP-ошибку (сервер ОТВЕТИЛ 4xx/5xx —
    // сеть в порядке). Раньше оба случая бросали одинаковый Error, и ChatScreen
    // показывал «Нет сети» даже на серверную ошибку + гонял её в бесконечный
    // ретрай outbox. Помечаем ошибку флагами isNetwork / status.
    let r;
    try {
      r = await authedFetch(`${BASE}/send`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({
          // Variant B: room_id — приоритетный путь (бэк берёт получателя из
          // участников комнаты, исключая гонку резолва собеседника на фронте).
          room_id: roomId || null,
          to_user_id: toUserId, text, photo_url: photoUrl,
          is_voice: isVoice || false, voice_duration: voiceDuration,
          cargo_id: cargoId, trip_id: tripId,
          client_msg_id: clientMsgId,  // QA-аудит P1-3: идемпотентность
          lang: getLanguage(),         // QA-аудит P2-8: локализация авто-ответа поддержки
        }),
      });
    } catch (e) {
      // fetch отклонён — реальный сетевой сбой/таймаут (запрос не дошёл).
      const err = new Error('network'); err.isNetwork = true; throw err;
    }
    if (!r.ok) {
      // Сервер ответил ошибкой — это НЕ «нет сети».
      const err = new Error(`send failed ${r.status}`); err.status = r.status; throw err;
    }
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
  // 4.3: загрузка фото сообщения в storage → { photo_key }. Native-safe
  // multipart (на web — blob, на native — {uri,name,type}, иначе RN шлёт
  // битый blob). Ключ идёт в chat.send как photo_url; сервер подпишет на чтении.
  async uploadChatPhoto(uri) {
    const token = await storage.get(TOKEN_KEY);
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((r) => r.blob());
      form.append('file', blob, 'chat.jpg');
    } else {
      form.append('file', { uri, name: 'chat.jpg', type: 'image/jpeg' });
    }
    const r = await authedFetch(`${BASE}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!r.ok) throw new Error(`chat photo upload failed ${r.status}`);
    return r.json();
  },

  // Голосовое: аудио → storage, возвращает { voice_key }. Сообщение шлётся
  // затем через send({ isVoice, voiceDuration, photoUrl: voice_key }).
  async uploadChatVoice(uri) {
    const token = await storage.get(TOKEN_KEY);
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((r) => r.blob());
      const ext = (blob.type || '').includes('webm') ? 'webm' : 'm4a';
      form.append('file', blob, `voice.${ext}`);
    } else {
      const ext = String(uri).split('.').pop() || 'm4a';
      form.append('file', { uri, name: `voice.${ext}`, type: `audio/${ext === 'm4a' ? 'mp4' : ext}` });
    }
    const r = await authedFetch(`${BASE}/voice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!r.ok) throw new Error(`chat voice upload failed ${r.status}`);
    return r.json();
  },

  // «Печатает…»: лёгкий пинг (fire-and-forget), партнёр увидит индикатор.
  async typing(roomId) {
    if (!roomId) return;
    try {
      await authedFetch(`${BASE}/typing`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ room_id: roomId }),
      });
    } catch { /* не мешаем набору текста */ }
  },

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
