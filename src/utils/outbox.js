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

export async function enqueueOutbox(item, userId) {
  // item: { clientId, payload }  (payload — аргументы chatAPI.send)
  // userId (Блок 2, P1-5): владелец записи — чья это была сессия в момент
  // постановки в очередь. Без этого поля flushOutbox не может отличить
  // «мои неотправленные сообщения» от «сообщения предыдущего пользователя
  // на этом же устройстве» и раньше отправлял всё подряд под ЛЮБЫМ
  // залогиненным юзером (App.js гонял flush по факту hasToken, без проверки
  // владельца).
  const arr = await _load();
  if (arr.some((x) => x.clientId === item.clientId)) return;  // уже в очереди
  arr.push({ clientId: item.clientId, payload: item.payload, userId: userId || null, ts: Date.now() });
  await _save(arr);
}

export async function outboxCount() {
  return (await _load()).length;
}

// Прогон очереди. sendFn(payload) должен бросать при неуспехе.
// Возвращает число успешно отправленных. При первой сетевой ошибке
// останавливаемся (сеть, вероятно, недоступна) — порядок сохраняется.
//
// activeUserId (Блок 2, P1-5): отправляем ТОЛЬКО записи текущего активного
// пользователя. Запись без userId — legacy (поставлена в очередь до этого
// фикса) — трактуем как принадлежащую текущему юзеру (иначе она застряла
// бы в очереди навсегда). Запись с ЧУЖИМ userId — не трогаем и не удаляем
// («карантин»): она уедет либо когда её реальный владелец снова
// залогинится, либо будет явно вычищена в signOut (см. clearOutbox).
export async function flushOutbox(sendFn, activeUserId) {
  let arr = await _load();
  if (!arr.length || !activeUserId) return 0;
  let sent = 0;
  for (const item of [...arr]) {
    if (item.userId && item.userId !== activeUserId) continue;
    try {
      await sendFn(item.payload);          // success или deduped (backend) — оба ок
      arr = arr.filter((x) => x.clientId !== item.clientId);
      await _save(arr);
      sent++;
    } catch (error) {
      const status = Number(error?.status || 0);
      if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        // Постоянная ошибка этого элемента не должна запирать очередь.
        arr = arr.filter((x) => x.clientId !== item.clientId);
        await _save(arr);
        continue;
      }
      // Сеть/5xx/429 временные: сохраняем порядок и счётчик попыток.
      arr = arr.map((x) => x.clientId === item.clientId
        ? { ...x, attempts: Number(x.attempts || 0) + 1, lastError: status || "network" }
        : x);
      await _save(arr);
      break;
    }
  }
  return sent;
}

/** Блок 2 (P1-5): полная очистка outbox — вызывается при logout, чтобы
 * недоотправленные сообщения вышедшего пользователя не «дожили» и не
 * ушли под следующей сессией на этом устройстве. */
export async function clearOutbox() {
  await _save([]);
}

/** То же, но только записи конкретного владельца (используется, если
 * когда-нибудь понадобится точечная очистка без потери чужих записей). */
export async function clearOutboxForUser(userId) {
  const arr = await _load();
  await _save(arr.filter((x) => x.userId !== userId));
}
