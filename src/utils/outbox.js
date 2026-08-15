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
let activeUserId = null;
let sessionGeneration = 0;
let flushChain = Promise.resolve();
let mutationChain = Promise.resolve();

function _stableUserId(userId) {
  if (typeof userId !== 'string') return null;
  const value = userId.trim();
  // AuthContext временно создаёт synthetic id до /register/me. Он не связан
  // с bearer identity и поэтому не может владеть persisted payload.
  if (!value || /^u_\d+$/.test(value)) return null;
  return value;
}

function _mutate(mutator) {
  const operation = mutationChain.then(async () => {
    const current = await _load();
    const result = await mutator(current);
    if (result.next !== current) await _save(result.next);
    return result.value;
  });
  mutationChain = operation.then(() => undefined, () => undefined);
  return operation;
}

/** App.js is the authority for the session which may drain the queue. */
export function bindOutboxSession(userId) {
  const next = _stableUserId(userId);
  if (!next) {
    if (activeUserId !== null) sessionGeneration++;
    activeUserId = null;
    return null;
  }
  if (activeUserId !== next) {
    activeUserId = next;
    sessionGeneration++;
  }
  return next;
}

export function invalidateOutboxSession(expectedUserId = null) {
  const expected = _stableUserId(expectedUserId);
  if (expected && activeUserId !== expected) return;
  activeUserId = null;
  sessionGeneration++;
}

function _sessionIsCurrent(userId, generation) {
  return activeUserId === userId && sessionGeneration === generation;
}

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
  const ownerId = _stableUserId(userId);
  if (!ownerId || !item?.clientId) return false;
  return _mutate((arr) => {
    if (arr.some((x) => x.clientId === item.clientId)) return { next: arr, value: true };
    return {
      next: [...arr, { clientId: item.clientId, payload: item.payload, userId: ownerId, ts: Date.now() }],
      value: true,
    };
  });
}

export async function outboxCount() {
  await mutationChain;
  return (await _load()).length;
}

// Прогон очереди. sendFn(payload) должен бросать при неуспехе.
// Возвращает число успешно отправленных. При первой сетевой ошибке
// останавливаемся (сеть, вероятно, недоступна) — порядок сохраняется.
//
// activeUserId (Блок 2, P1-5): отправляем ТОЛЬКО записи текущего активного
// пользователя. Запись без userId — legacy и остаётся в карантине: безопасно
// определить её владельца невозможно. Missing/synthetic activeUserId также
// fail-closed. App.js дополнительно привязывает drain к generation сессии.
export async function flushOutbox(sendFn, requestedUserId) {
  const ownerId = _stableUserId(requestedUserId);
  if (!ownerId || ownerId !== requestedUserId) return 0;

  const operation = flushChain.then(async () => {
    const generation = sessionGeneration;
    if (!_sessionIsCurrent(ownerId, generation)) return 0;
    await mutationChain;
    const snapshot = await _load();
    let sent = 0;
    for (const item of snapshot) {
      // Exact ownership only: foreign and legacy/null records are quarantined.
      if (item.userId !== ownerId) continue;
      if (!_sessionIsCurrent(ownerId, generation)) break;
      try {
        await sendFn(item.payload, {
          userId: ownerId,
          isCurrent: () => _sessionIsCurrent(ownerId, generation),
        });
        await _mutate((current) => ({
          next: current.filter((x) => !(x.clientId === item.clientId && x.userId === ownerId)),
          value: undefined,
        }));
        sent++;
      } catch {
        break;
      }
    }
    return sent;
  });
  flushChain = operation.then(() => undefined, () => undefined);
  return operation;
}

/** Блок 2 (P1-5): полная очистка outbox — вызывается при logout, чтобы
 * недоотправленные сообщения вышедшего пользователя не «дожили» и не
 * ушли под следующей сессией на этом устройстве. */
export async function clearOutbox() {
  // Logout cancels queued/in-flight drain before storage/token can switch.
  invalidateOutboxSession();
  await _mutate(() => ({ next: [], value: undefined }));
}

/** То же, но только записи конкретного владельца (используется, если
 * когда-нибудь понадобится точечная очистка без потери чужих записей). */
export async function clearOutboxForUser(userId) {
  const ownerId = _stableUserId(userId);
  if (!ownerId) return;
  await _mutate((arr) => ({
    next: arr.filter((x) => x.userId !== ownerId),
    value: undefined,
  }));
}
