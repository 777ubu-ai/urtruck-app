// chatSmoke — backend chat-API smoke test.
//
// Что проверяет:
//   1) /chat/translate/info     — public, нет auth: провайдер OpenAI настроен?
//   2) /chat/contacts           — public, нет auth: support-bot существует и online?
//   3) (если URTRUCK_TOKEN задан): authenticated flow:
//      a) /chat/unread          — текущий unread count
//      b) /chat/rooms           — список комнат пользователя
//      c) /chat/send → support  — отправка тестового сообщения support-bot'у
//      d) /chat/messages/<room> — проверить что сообщение пришло
//      e) /chat/translate       — перевести своё же сообщение на en/zh
//
// Запуск:
//   public-режим (по умолчанию):
//     node qa/utils/chatSmoke.js
//
//   с реальным token'ом (получить из браузера: localStorage.ur_reg_token):
//     URTRUCK_TOKEN=<token> node qa/utils/chatSmoke.js
//
//   против локального бэкенда:
//     URTRUCK_API=http://localhost:8001 node qa/utils/chatSmoke.js
//
// Возвращает exit 0 (всё OK) / 1 (что-то сломано).
// Маркер `[ar-chatSmoke-<timestamp>]` в тексте — чтобы Auditor мог
// потом отсеять qa-сообщения из dirty_bids_report.

const PROD_API = 'https://urtruck.kz/security/api/v1';
const DEFAULT_API = process.env.URTRUCK_API || PROD_API;
const TOKEN = process.env.URTRUCK_TOKEN || null;
const SUPPORT_ID = 'urtruck-support-bot';
const QA_TAG = `[ar-chatSmoke-${Date.now().toString(36)}]`;

const RESULTS = [];
let HAS_FAIL = false;

function record(name, ok, detail = '') {
  RESULTS.push({ name, ok, detail });
  if (!ok) HAS_FAIL = true;
  const icon = ok ? '✅' : '❌';
  const tail = detail ? ` — ${detail}` : '';
  console.log(`${icon} ${name}${tail}`);
}

async function call(method, path, body = null) {
  const url = `${DEFAULT_API}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, ok: r.ok, json, text };
}

// ─── PUBLIC tests (без auth) ────────────────────────────────────────

async function testTranslateInfo() {
  const r = await call('GET', '/chat/translate/info');
  if (r.status !== 200) {
    return record('chat/translate/info', false, `HTTP ${r.status}`);
  }
  const info = r.json || {};
  const provider = info.provider || 'unknown';
  const hasKey = !!info.openai_key_exists || !!info.key_configured;
  record(
    'chat/translate/info',
    true,
    `provider=${provider}, key=${hasKey ? 'ok' : 'absent'}`,
  );
}

async function testContacts() {
  const r = await call('GET', '/chat/contacts');
  if (r.status !== 200) {
    return record('chat/contacts', false, `HTTP ${r.status}`);
  }
  const contacts = (r.json && r.json.contacts) || [];
  const support = contacts.find((c) => c.id === SUPPORT_ID);
  if (!support) {
    return record('chat/contacts', false, 'support-bot не найден');
  }
  record('chat/contacts', true, `${contacts.length} спец.контактов, support=${support.name}`);
}

// ─── AUTHENTICATED tests (требуют URTRUCK_TOKEN) ────────────────────

async function testUnread() {
  const r = await call('GET', '/chat/unread');
  if (r.status !== 200) {
    return record('chat/unread', false, `HTTP ${r.status}`);
  }
  const n = (r.json && (r.json.unread ?? r.json.count ?? 0));
  record('chat/unread', true, `unread=${n}`);
}

async function testRooms() {
  const r = await call('GET', '/chat/rooms');
  if (r.status !== 200) {
    return record('chat/rooms', false, `HTTP ${r.status}`);
  }
  const rooms = (r.json && r.json.rooms) || [];
  record('chat/rooms', true, `${rooms.length} комнат`);
  return rooms;
}

async function testSendToSupport() {
  const body = {
    to_user_id: SUPPORT_ID,
    text: `${QA_TAG} smoke ping`,
  };
  const r = await call('POST', '/chat/send', body);
  if (r.status !== 200) {
    return record('chat/send → support', false, `HTTP ${r.status} ${(r.text || '').slice(0, 80)}`);
  }
  const roomId = r.json && (r.json.room_id || r.json.roomId);
  record('chat/send → support', true, `room_id=${roomId}`);
  return roomId;
}

async function testMessages(roomId) {
  if (!roomId) {
    return record('chat/messages/<room>', false, 'no roomId');
  }
  const r = await call('GET', `/chat/messages/${roomId}?limit=20`);
  if (r.status !== 200) {
    return record('chat/messages/<room>', false, `HTTP ${r.status}`);
  }
  const messages = (r.json && r.json.messages) || [];
  const mine = messages.find((m) => (m.text || '').includes(QA_TAG));
  if (!mine) {
    return record('chat/messages/<room>', false, 'тестовое сообщение не найдено');
  }
  record('chat/messages/<room>', true, `${messages.length} сообщений, тестовое id=${mine.id}`);
  return mine.id;
}

async function testTranslate(messageId) {
  if (!messageId) {
    return record('chat/translate (en)', false, 'no messageId');
  }
  const r = await call('POST', '/chat/translate', {
    message_id: messageId,
    target_lang: 'en',
  });
  if (r.status !== 200) {
    return record('chat/translate (en)', false, `HTTP ${r.status} ${(r.text || '').slice(0, 80)}`);
  }
  const translated = r.json && (r.json.translated_text || r.json.translation);
  if (!translated) {
    return record('chat/translate (en)', false, 'нет translated_text в ответе');
  }
  record('chat/translate (en)', true, `"${String(translated).slice(0, 60)}"`);
}

// ─── runner ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n[chatSmoke] API: ${DEFAULT_API}`);
  console.log(`[chatSmoke] tag: ${QA_TAG}`);
  console.log(`[chatSmoke] mode: ${TOKEN ? 'AUTHENTICATED' : 'PUBLIC ONLY'}\n`);

  // public всегда
  await testTranslateInfo();
  await testContacts();

  // authenticated только с токеном
  if (TOKEN) {
    console.log('');
    await testUnread();
    await testRooms();
    const roomId = await testSendToSupport();
    if (roomId) {
      // backend нужно ~100ms на write/preview UPDATE
      await new Promise((r) => setTimeout(r, 500));
      const messageId = await testMessages(roomId);
      if (messageId) await testTranslate(messageId);
    }
  } else {
    console.log('\n(пропускаю authenticated tests — задай URTRUCK_TOKEN чтобы прогнать send/receive/translate)');
  }

  console.log('\n─────────────────────────────────────');
  const passed = RESULTS.filter((r) => r.ok).length;
  const failed = RESULTS.length - passed;
  console.log(`[chatSmoke] ${passed} ok, ${failed} failed`);
  process.exit(HAS_FAIL ? 1 : 0);
}

main().catch((e) => {
  console.error('[chatSmoke] crashed:', e && (e.stack || e.message || e));
  process.exit(2);
});
