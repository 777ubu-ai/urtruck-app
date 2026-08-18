import { Platform } from 'react-native';
import { storage } from './storage';
import { API_BASE } from '../config/env';
import { authedFetch } from './authEvents';
import { getLanguage } from './i18n';

const BASE = `${API_BASE}/chat`;
const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

function attachmentError(message, { status = null, detail = null, isNetwork = false } = {}) {
  const error = new Error(message || detail || 'attachment upload failed');
  error.status = status;
  error.detail = detail || message || null;
  error.isNetwork = Boolean(isNetwork);
  return error;
}

function mimeFromName(name, fallback = 'application/octet-stream') {
  const value = String(name || '').toLowerCase();
  if (value.endsWith('.pdf')) return 'application/pdf';
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.jpg') || value.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

export const chatAPI = {
  async send({ roomId, toUserId, text, photoUrl, isVoice, voiceDuration, cargoId, tripId, clientMsgId }) {
    let r;
    try {
      r = await authedFetch(`${BASE}/send`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({
          room_id: roomId || null,
          to_user_id: toUserId, text, photo_url: photoUrl,
          is_voice: isVoice || false, voice_duration: voiceDuration,
          cargo_id: cargoId, trip_id: tripId,
          client_msg_id: clientMsgId,
          lang: getLanguage(),
        }),
      });
    } catch (e) {
      const err = new Error('network'); err.isNetwork = true; throw err;
    }
    if (!r.ok) {
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

  async acceptBid(bidId) {
    const r = await authedFetch(`${API_BASE}/market/bids/${bidId}/accept`, {
      method: 'POST', headers: await headers(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.detail || `accept failed ${r.status}`);
    return data;
  },

  async listAttachments(conversationId) {
    const r = await authedFetch(`${API_BASE}/chat/conversations/${conversationId}/attachments`, {
      headers: await headers(),
    });
    return r.json();
  },

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

  async typing(roomId) {
    if (!roomId) return;
    try {
      await authedFetch(`${BASE}/typing`, {
        method: 'POST', headers: await headers(),
        body: JSON.stringify({ room_id: roomId }),
      });
    } catch { /* typing must never block composer */ }
  },

  async uploadAttachment(
    conversationId,
    {
      uri,
      kind = 'document',
      name = 'file.bin',
      type = null,
      clientUploadId = null,
    } = {},
  ) {
    if (!conversationId || !uri) {
      throw attachmentError('attachment input missing');
    }

    const token = await storage.get(TOKEN_KEY);
    const form = new FormData();
    const requestedType = type || mimeFromName(name);

    // Safari/PWA may expose a selected PDF as Blob with empty/octet-stream
    // MIME. Re-wrap the bytes using the picker-provided/extension-derived MIME
    // so multipart metadata is useful, while backend magic bytes remain the
    // source of truth. Native keeps the RN {uri,name,type} contract.
    if (Platform.OS === 'web') {
      let blob;
      try {
        const read = await fetch(uri);
        if (!read.ok) throw attachmentError(`document read failed ${read.status}`, { status: read.status });
        blob = await read.blob();
      } catch (error) {
        if (error?.status) throw error;
        throw attachmentError('document read failed', { detail: error?.message || 'document read failed' });
      }
      const finalType = requestedType && requestedType !== 'application/octet-stream'
        ? requestedType
        : (blob.type || mimeFromName(name));
      const part = typeof File !== 'undefined'
        ? new File([blob], name, { type: finalType || 'application/octet-stream' })
        : new Blob([blob], { type: finalType || 'application/octet-stream' });
      form.append('file', part, name);
    } else {
      form.append('file', {
        uri,
        name,
        type: requestedType || 'application/octet-stream',
      });
    }
    form.append('kind', kind);
    if (clientUploadId) form.append('client_upload_id', String(clientUploadId));

    let response;
    try {
      response = await authedFetch(`${API_BASE}/chat/conversations/${conversationId}/attachments`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
    } catch (error) {
      throw attachmentError('network', { isNetwork: true, detail: error?.message || 'network' });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : `upload failed ${response.status}`;
      throw attachmentError(detail, { status: response.status, detail });
    }
    return data;
  },
};
