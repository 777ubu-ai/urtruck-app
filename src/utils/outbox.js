// QA-аудит P1-3: офлайн-очередь исходящих сообщений чата.
//
// Проблема: при потере сети chatAPI.send падал → сообщение терялось
// (после P0-2 хотя бы показывался toast, но пользователь должен был
// набирать заново). Теперь неотправленное кладётся в персистентную
// очередь и ретраится при следующем входе в чат / возврате сети.
//
// Безопасность от задвоения: каждый элемент несёт clientId, который
// уходит на backend как client_msg_id. Backend идемпотентен (UNIQUE
// (sender_id, client_msg_id) + дедуп), поэтому повторная доставка
// «уже дошедшего» сообщения не создаёт дубль.
//
// Объём: только ТЕКСТОВЫЕ сообщения. Фото/войс не очередим (локальные
// URI не переживают рестарт надёжно) — они получают clientMsgId только
// для дедупа в рамках сессии.

import { storage } from './storage';

const KEY = 'ur_chat_outbox';
const MAX = 50;
const listeners = new Set();

async function _load() {
  try {
    const raw = await storage.get(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function _save(arr) {
  try { await storage.set(KEY, JSON.stringify(arr.slice(-MAX))); } catch {}
  for (const cb of listeners) { try { cb(arr.length); } catch {} }
}

export function subscribeOutbox(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function enqueueOutbox(item) {
  // item: { clientId, payload }  (payload — аргументы chatAPI.send)
  const arr = await _load();
  if (arr.some((x) => x.clientId === item.clientId)) return;  // уже в очереди
  arr.push({ clientId: item.clientId, payload: item.payload, ts: Date.now() });
  await _save(arr);
}

export async function outboxCount() {
  return (await _load()).length;
}

// Прогон очереди. sendFn(payload) должен бросать при неуспехе.
// Возвращает число успешно отправленных. При первой сетевой ошибке
// останавливаемся (сеть, вероятно, недоступна) — порядок сохраняется.
export async function flushOutbox(sendFn) {
  let arr = await _load();
  if (!arr.length) return 0;
  let sent = 0;
  for (const item of [...arr]) {
    try {
      await sendFn(item.payload);          // success или deduped (backend) — оба ок
      arr = arr.filter((x) => x.clientId !== item.clientId);
      await _save(arr);
      sent++;
    } catch {
      break;  // сеть недоступна — не долбим, оставляем хвост на следующий flush
    }
  }
  return sent;
}
